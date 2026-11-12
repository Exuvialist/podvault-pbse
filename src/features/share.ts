/**
 * Ephemeral sharing: re-encrypt the plaintext under a throwaway key, put the ciphertext
 * on the Pod, and keep the key out of the server's reach (URL fragment or passphrase).
 *
 * Expiry is enforced by the client and by deleting/revoking the blob. A hostile recipient
 * who already copied the blob keeps their copy — real revocation needs Pod ACL/ACP (Phase 3).
 */
import type { FileRecord, ShareRecord } from '../core/types.js';
import { PATHS } from '../core/types.js';
import type { StorageAdapter } from '../storage/adapter.js';
import { PBKDF2_ITERATIONS, deriveKek, importAesKey, newAesKey, open, seal } from '../core/crypto.js';
import { fromB64u, randomBytes, toB64u, wipe } from '../core/bytes.js';
import { isExpired, shareExpiry } from '../core/expiry.js';
import { openFile } from '../core/keys.js';
import type { VaultSession } from './vault.js';

export interface CreateShareOptions {
  hours: number;
  /** Optional second factor; when set the key never appears in the URL. */
  passphrase?: string;
  /** Included in the link when the vault lives on a Pod, so a recipient's browser can reach it. */
  podUrl?: string;
}

export interface CreatedShare {
  record: ShareRecord;
  url: string;
}

export class ShareError extends Error {
  constructor(readonly code: 'tidak-ada' | 'kedaluwarsa' | 'dicabut' | 'butuh-passphrase' | 'kunci-tidak-ada' | 'integrity') {
    super(code);
    this.name = 'ShareError';
  }
}

export async function createShare(
  adapter: StorageAdapter,
  session: VaultSession,
  file: FileRecord,
  opts: CreateShareOptions,
): Promise<CreatedShare> {
  if (!(opts.hours > 0) || opts.hours > 24 * 7) throw new Error('durasi-tidak-valid');

  const plaintext = await openFile(session.masterKey, file);
  const { key: shareKey, raw: shareRaw } = await newAesKey();
  const cipher = await seal(shareKey, plaintext);
  wipe(plaintext);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  let wrappedKey: ShareRecord['wrappedKey'];
  let kdf: ShareRecord['kdf'];
  let urlKey = '';

  if (opts.passphrase) {
    const salt = randomBytes(16);
    const kek = await deriveKek(opts.passphrase, salt, PBKDF2_ITERATIONS);
    wrappedKey = await seal(kek, shareRaw);
    kdf = { name: 'PBKDF2-SHA256', iterations: PBKDF2_ITERATIONS, salt: toB64u(salt) };
  } else {
    // The fragment is never sent in the HTTP request line, so the Pod cannot see the key.
    urlKey = toB64u(shareRaw);
  }
  const ownerWrappedKey = await seal(session.masterKey, shareRaw);
  wipe(shareRaw);

  const record: ShareRecord = {
    id,
    fileId: file.id,
    fileName: file.name,
    mime: file.mime,
    size: file.size,
    createdAt: now,
    expiresAt: shareExpiry(opts.hours),
    cipher,
    revoked: false,
    views: 0,
    ownerWrappedKey,
    ...(wrappedKey ? { wrappedKey } : {}),
    ...(kdf ? { kdf } : {}),
  };

  await adapter.writeText(PATHS.share(id), JSON.stringify(record));
  return { record, url: shareUrl(id, urlKey, opts.podUrl) };
}

/** Rebuild a share link for the owner (requires an unlocked session). */
export async function shareLinkFor(session: VaultSession, record: ShareRecord, podUrl = ''): Promise<string> {
  if (!record.ownerWrappedKey) return shareUrl(record.id, '', podUrl);
  const raw = await open(session.masterKey, record.ownerWrappedKey);
  const key = record.wrappedKey ? '' : toB64u(raw);
  wipe(raw);
  return shareUrl(record.id, key, podUrl);
}

export function shareUrl(id: string, key = '', podUrl = ''): string {
  const base =
    typeof location !== 'undefined' ? `${location.origin}${location.pathname}` : 'https://podvault.local/';
  const pod = podUrl ? `?pod=${encodeURIComponent(podUrl)}` : '';
  return key ? `${base}#/share/${id}/${key}${pod}` : `${base}#/share/${id}${pod}`;
}

export async function readShare(adapter: StorageAdapter, id: string): Promise<ShareRecord | null> {
  const raw = await adapter.readText(PATHS.share(id));
  return raw ? (JSON.parse(raw) as ShareRecord) : null;
}

export async function listShares(adapter: StorageAdapter): Promise<ShareRecord[]> {
  const paths = await adapter.list('/vault/shares/');
  const out: ShareRecord[] = [];
  for (const path of paths) {
    const raw = await adapter.readText(path);
    if (!raw) continue;
    try {
      out.push(JSON.parse(raw) as ShareRecord);
    } catch {
      /* skip corrupt */
    }
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function openShare(
  adapter: StorageAdapter,
  id: string,
  urlKey?: string,
  passphrase?: string,
): Promise<{ record: ShareRecord; bytes: Uint8Array }> {
  const record = await readShare(adapter, id);
  if (!record) throw new ShareError('tidak-ada');
  if (record.revoked) throw new ShareError('dicabut');
  if (isExpired(record)) throw new ShareError('kedaluwarsa');

  let raw: Uint8Array;
  if (record.wrappedKey && record.kdf) {
    if (!passphrase) throw new ShareError('butuh-passphrase');
    const kek = await deriveKek(passphrase, fromB64u(record.kdf.salt), record.kdf.iterations);
    raw = await open(kek, record.wrappedKey);
  } else {
    if (!urlKey) throw new ShareError('kunci-tidak-ada');
    raw = fromB64u(urlKey);
  }

  const key = await importAesKey(raw);
  wipe(raw);
  const bytes = await open(key, record.cipher);

  // Best-effort view counter; never block the recipient on a write failure.
  const next: ShareRecord = { ...record, views: record.views + 1 };
  void adapter.writeText(PATHS.share(id), JSON.stringify(next)).catch(() => {});

  return { record, bytes };
}

export async function revokeShare(adapter: StorageAdapter, id: string): Promise<void> {
  const record = await readShare(adapter, id);
  if (!record) return;
  await adapter.writeText(PATHS.share(id), JSON.stringify({ ...record, revoked: true }));
}

/** Remove share blobs that expired more than a day ago. Returns the removed ids. */
export async function pruneShares(adapter: StorageAdapter): Promise<string[]> {
  const removed: string[] = [];
  const graceMs = 24 * 60 * 60 * 1000;
  for (const share of await listShares(adapter)) {
    if (Date.parse(share.expiresAt) + graceMs < Date.now()) {
      await adapter.remove(PATHS.share(share.id));
      removed.push(share.id);
    }
  }
  return removed;
}
