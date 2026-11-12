/**
 * VaultService — the only place that combines storage with the key hierarchy.
 * The unlocked session (MK) lives in memory only and is dropped on lock().
 */
import type { AuditEvent, CategoryId, FileRecord, ShareRecord, VaultConfig, VaultSettings } from '../core/types.js';
import { CATEGORIES, PATHS } from '../core/types.js';
import type { StorageAdapter } from '../storage/adapter.js';
import { appendAudit } from '../core/audit.js';
import { buildManifest, manifestToTurtle } from '../core/manifest.js';
import { changePassphrase, createVault, openFile, sealFile, unlockVault, unlockWithMasterKeyRaw } from '../core/keys.js';
import { fromUtf8, utf8, wipe } from '../core/bytes.js';

export interface VaultSession {
  config: VaultConfig;
  masterKey: CryptoKey;
  masterKeyRaw: Uint8Array;
}

export class DuplicateFileError extends Error {
  constructor(readonly existing: FileRecord) {
    super('duplikat');
    this.name = 'DuplicateFileError';
  }
}

export class VaultService {
  private session: VaultSession | null = null;

  constructor(readonly adapter: StorageAdapter) {}

  get isUnlocked(): boolean {
    return this.session !== null;
  }

  /** Exposed for features that need MK (share, recovery). Never persist this. */
  get unlocked(): VaultSession | null {
    return this.session;
  }

  get config(): VaultConfig | null {
    return this.session?.config ?? null;
  }

  get webId(): string {
    return this.session?.config.webId ?? '';
  }

  async init(): Promise<void> {
    await this.adapter.init();
  }

  async exists(): Promise<boolean> {
    return (await this.adapter.readText(PATHS.config)) !== null;
  }

  async readConfig(): Promise<VaultConfig | null> {
    const raw = await this.adapter.readText(PATHS.config);
    if (raw === null) return null;
    return JSON.parse(raw) as VaultConfig;
  }

  async create(passphrase: string, webId: string): Promise<VaultSession> {
    if (await this.exists()) throw new Error('vault-sudah-ada');
    const { config, masterKey, masterKeyRaw } = await createVault(passphrase, webId);
    await this.writeConfig(config);
    this.session = { config, masterKey, masterKeyRaw };
    await this.audit('vault.create', webId, `storage=${this.adapter.kind}`);
    await this.rebuildManifest();
    return this.session;
  }

  async unlock(passphrase: string): Promise<VaultSession> {
    const config = await this.readConfig();
    if (!config) throw new Error('vault-tidak-ada');
    const { masterKey, masterKeyRaw } = await unlockVault(config, passphrase);
    this.session = { config, masterKey, masterKeyRaw };
    await this.audit('vault.unlock', config.webId);
    return this.session;
  }

  /** Recovery path: the paper shares reconstruct MK directly, bypassing the passphrase. */
  async unlockWithMasterKey(raw: Uint8Array): Promise<VaultSession> {
    const config = await this.readConfig();
    if (!config) throw new Error('vault-tidak-ada');
    const masterKey = await unlockWithMasterKeyRaw(raw);
    this.session = { config, masterKey, masterKeyRaw: raw };
    await this.audit('vault.unlock', config.webId, 'metode=recovery-sheet');
    return this.session;
  }

  lock(): void {
    if (!this.session) return;
    wipe(this.session.masterKeyRaw);
    this.session = null;
  }

  async changePassphrase(newPassphrase: string): Promise<void> {
    const s = this.requireSession();
    const config = await changePassphrase(s.config, s.masterKeyRaw, newPassphrase);
    await this.writeConfig(config);
    s.config = config;
    await this.audit('vault.passphrase.change', config.webId);
  }

  async updateSettings(patch: Partial<VaultSettings>): Promise<VaultConfig> {
    const s = this.requireSession();
    const config: VaultConfig = { ...s.config, settings: { ...s.config.settings, ...patch } };
    await this.writeConfig(config);
    s.config = config;
    return config;
  }

  async setRecovery(params: NonNullable<VaultConfig['recovery']>): Promise<VaultConfig> {
    const s = this.requireSession();
    const config: VaultConfig = { ...s.config, recovery: params };
    await this.writeConfig(config);
    s.config = config;
    await this.audit('recovery.create', config.webId, `t=${params.threshold} n=${params.shares}`);
    return config;
  }

  async listFiles(): Promise<FileRecord[]> {
    const paths = await this.adapter.list('/vault/files/');
    const out: FileRecord[] = [];
    for (const path of paths) {
      const raw = await this.adapter.readText(path);
      if (raw === null) continue;
      try {
        out.push(JSON.parse(raw) as FileRecord);
      } catch {
        // A corrupt record must not take down the whole listing.
      }
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getFile(id: string): Promise<FileRecord | null> {
    const raw = await this.adapter.readText(PATHS.file(id));
    return raw === null ? null : (JSON.parse(raw) as FileRecord);
  }

  async addFile(file: File, category: CategoryId, tags: string[] = []): Promise<FileRecord> {
    const s = this.requireSession();
    const plaintext = new Uint8Array(await file.arrayBuffer());
    const { cipher, wrappedKey, sha256 } = await sealFile(s.masterKey, plaintext);
    wipe(plaintext);

    const existing = (await this.listFiles()).find((f) => f.sha256 === sha256);
    if (existing) throw new DuplicateFileError(existing);

    const now = new Date().toISOString();
    const record: FileRecord = {
      id: crypto.randomUUID(),
      name: file.name,
      mime: file.type || 'application/octet-stream',
      size: file.size,
      category,
      createdAt: now,
      updatedAt: now,
      sha256,
      cipher,
      wrappedKey,
      tags,
    };
    await this.adapter.writeText(PATHS.file(record.id), JSON.stringify(record));
    await this.audit('file.add', record.id, `${record.name} (${record.size}B)`);
    await this.rebuildManifest();
    return record;
  }

  async readFile(id: string): Promise<{ record: FileRecord; bytes: Uint8Array }> {
    const s = this.requireSession();
    const record = await this.getFile(id);
    if (!record) throw new Error('file-tidak-ada');
    const bytes = await openFile(s.masterKey, record);
    await this.audit('file.view', id, record.name);
    return { record, bytes };
  }

  async updateFile(id: string, patch: Partial<Pick<FileRecord, 'name' | 'category' | 'tags'>>): Promise<FileRecord> {
    this.requireSession();
    const record = await this.getFile(id);
    if (!record) throw new Error('file-tidak-ada');
    const next: FileRecord = { ...record, ...patch, updatedAt: new Date().toISOString() };
    await this.adapter.writeText(PATHS.file(id), JSON.stringify(next));
    await this.audit('file.update', id, Object.keys(patch).join(','));
    await this.rebuildManifest();
    return next;
  }

  async deleteFile(id: string): Promise<void> {
    this.requireSession();
    const record = await this.getFile(id);
    await this.adapter.remove(PATHS.file(id));
    await this.audit('file.delete', id, record?.name ?? '');
    await this.rebuildManifest();
  }

  async listShares(): Promise<ShareRecord[]> {
    const paths = await this.adapter.list('/vault/shares/');
    const out: ShareRecord[] = [];
    for (const path of paths) {
      const raw = await this.adapter.readText(path);
      if (raw === null) continue;
      try {
        out.push(JSON.parse(raw) as ShareRecord);
      } catch {
        /* ignore corrupt share */
      }
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async rebuildManifest(): Promise<void> {
    const config = this.config;
    if (!config) return;
    const files = await this.listFiles();
    const manifest = buildManifest(config, files);
    await this.adapter.writeText(PATHS.manifest, JSON.stringify(manifest, null, 2));
    await this.adapter.writeText('/vault/manifest.ttl', manifestToTurtle(manifest));
  }

  async audit(action: string, target: string, detail?: string): Promise<void> {
    const actor = this.config?.webId ?? 'anonim';
    const raw = await this.adapter.readText(PATHS.audit);
    const events: AuditEvent[] = raw ? (JSON.parse(raw) as AuditEvent[]) : [];
    const next = await appendAudit(events, actor, action, target, detail);
    await this.adapter.writeText(PATHS.audit, JSON.stringify(next, null, 2));
  }

  async readAudit(): Promise<AuditEvent[]> {
    const raw = await this.adapter.readText(PATHS.audit);
    return raw ? (JSON.parse(raw) as AuditEvent[]) : [];
  }

  private requireSession(): VaultSession {
    if (!this.session) throw new Error('terkunci');
    return this.session;
  }

  private async writeConfig(config: VaultConfig): Promise<void> {
    await this.adapter.writeText(PATHS.config, JSON.stringify(config, null, 2));
  }
}

export function searchFiles(files: FileRecord[], query: string): FileRecord[] {
  const q = query.trim().toLowerCase();
  if (!q) return files;
  return files.filter((f) => {
    const category = CATEGORIES.find((c) => c.id === f.category)?.label ?? f.category;
    return (
      f.name.toLowerCase().includes(q) ||
      category.toLowerCase().includes(q) ||
      f.tags.some((t) => t.toLowerCase().includes(q))
    );
  });
}

export function groupByCategory(files: FileRecord[]): Array<{ id: CategoryId; files: FileRecord[] }> {
  return CATEGORIES.map((c) => ({
    id: c.id,
    files: files.filter((f) => f.category === c.id),
  })).filter((g) => g.files.length > 0);
}

/** Decode a stored file to text, used by the integrity/export tooling. */
export function decodeUtf8(bytes: Uint8Array): string {
  return fromUtf8(bytes);
}

export function encodeUtf8(text: string): Uint8Array {
  return utf8(text);
}
