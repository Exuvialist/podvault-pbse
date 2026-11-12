import { beforeEach, describe, expect, it } from 'vitest';
import {
  ShareError,
  createShare,
  openShare,
  pruneShares,
  readShare,
  revokeShare,
  shareLinkFor,
} from '../features/share.js';
import { MemoryAdapter } from '../storage/memory.js';
import { createVault, sealFile, type UnlockedKeys } from '../core/keys.js';
import type { FileRecord, VaultConfig } from '../core/types.js';
import { PATHS } from '../core/types.js';

const PASS = 'passphrase-uji-yang-panjang';

interface Session extends UnlockedKeys {
  config: VaultConfig;
}

let adapter: MemoryAdapter;
let session: Session;
let file: FileRecord;

function keyFromLink(link: string): string {
  const hash = new URL(link).hash;
  const parts = hash.replace(/^#\/?/, '').split('/');
  return (parts[2] ?? '').split('?')[0] ?? '';
}

beforeEach(async () => {
  adapter = new MemoryAdapter();
  const created = await createVault(PASS, 'https://demo.pod/profile#me');
  session = { config: created.config, masterKey: created.masterKey, masterKeyRaw: created.masterKeyRaw };

  const plaintext = new TextEncoder().encode('ISI-RAHASIA-SHARE');
  const sealed = await sealFile(session.masterKey, plaintext);
  file = {
    id: 'file-1',
    name: 'dokumen.pdf',
    mime: 'application/pdf',
    size: plaintext.length,
    category: 'aset',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    tags: [],
    ...sealed,
  };
});

describe('ephemeral sharing', () => {
  it('creates a link whose key lives in the fragment, not in the Pod', async () => {
    const { record, url } = await createShare(adapter, session, file, { hours: 1 });
    expect(url).toContain('#/share/');
    expect(keyFromLink(url)).not.toBe('');

    const stored = JSON.stringify(adapter.dump());
    expect(stored).not.toContain(keyFromLink(url));
    expect(stored).not.toContain('ISI-RAHASIA-SHARE');
    expect(record.wrappedKey).toBeUndefined();
    expect(record.ownerWrappedKey).toBeDefined();
  });

  it('opens with the fragment key and returns the original bytes', async () => {
    const { record, url } = await createShare(adapter, session, file, { hours: 1 });
    const { bytes } = await openShare(adapter, record.id, keyFromLink(url));
    expect(new TextDecoder().decode(bytes)).toBe('ISI-RAHASIA-SHARE');
  });

  it('requires the passphrase when one was set, and never puts a key in the URL', async () => {
    const { record, url } = await createShare(adapter, session, file, { hours: 6, passphrase: 'rahasia-penerima' });
    expect(keyFromLink(url)).toBe('');

    await expect(openShare(adapter, record.id)).rejects.toMatchObject({ code: 'butuh-passphrase' });
    await expect(openShare(adapter, record.id, '', 'passphrase-salah')).rejects.toThrow('integrity');

    const { bytes } = await openShare(adapter, record.id, '', 'rahasia-penerima');
    expect(new TextDecoder().decode(bytes)).toBe('ISI-RAHASIA-SHARE');
  });

  it('rejects an expired link', async () => {
    const { record } = await createShare(adapter, session, file, { hours: 1 });
    const stored = JSON.parse((await adapter.readText(PATHS.share(record.id))) as string) as Record<string, unknown>;
    stored.expiresAt = '2020-01-01T00:00:00.000Z';
    await adapter.writeText(PATHS.share(record.id), JSON.stringify(stored));

    await expect(openShare(adapter, record.id, 'abc')).rejects.toMatchObject({ code: 'kedaluwarsa' });
  });

  it('rejects a revoked link', async () => {
    const { record, url } = await createShare(adapter, session, file, { hours: 1 });
    await revokeShare(adapter, record.id);
    await expect(openShare(adapter, record.id, keyFromLink(url))).rejects.toMatchObject({ code: 'dicabut' });
  });

  it('counts views without blocking the recipient', async () => {
    const { record, url } = await createShare(adapter, session, file, { hours: 1 });
    await openShare(adapter, record.id, keyFromLink(url));
    await openShare(adapter, record.id, keyFromLink(url));
    const after = await readShare(adapter, record.id);
    expect(after?.views).toBe(2);
  });

  it('lets the owner regenerate a working link', async () => {
    const { record } = await createShare(adapter, session, file, { hours: 1 });
    const link = await shareLinkFor(session, record, 'https://pod.test/');
    expect(link).toContain('pod=https%3A%2F%2Fpod.test%2F');
    const { bytes } = await openShare(adapter, record.id, keyFromLink(link));
    expect(new TextDecoder().decode(bytes)).toBe('ISI-RAHASIA-SHARE');
  });

  it('prunes links that expired more than a day ago', async () => {
    const { record } = await createShare(adapter, session, file, { hours: 1 });
    const stored = JSON.parse((await adapter.readText(PATHS.share(record.id))) as string) as Record<string, unknown>;
    stored.expiresAt = '2020-01-01T00:00:00.000Z';
    await adapter.writeText(PATHS.share(record.id), JSON.stringify(stored));

    const removed = await pruneShares(adapter);
    expect(removed).toEqual([record.id]);
    expect(await readShare(adapter, record.id)).toBeNull();
  });

  it('rejects an unknown share id', async () => {
    await expect(openShare(adapter, 'tidak-ada', 'abc')).rejects.toBeInstanceOf(ShareError);
  });
});
