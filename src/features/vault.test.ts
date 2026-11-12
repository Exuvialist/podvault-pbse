import { beforeEach, describe, expect, it } from 'vitest';
import { DuplicateFileError, VaultService, groupByCategory, searchFiles } from '../features/vault.js';
import { MemoryAdapter } from '../storage/memory.js';
import { verifyAudit } from '../core/audit.js';
import { PATHS } from '../core/types.js';

const PASS = 'passphrase-uji-yang-cukup-panjang';
const WEBID = 'https://demo.pod/profile/card#me';

function pdf(name: string, marker: string): File {
  const body = new TextEncoder().encode(`%PDF-1.4\n${marker}\n%%EOF`);
  return new File([body], name, { type: 'application/pdf' });
}

describe('VaultService', () => {
  let adapter: MemoryAdapter;
  let service: VaultService;

  beforeEach(async () => {
    adapter = new MemoryAdapter();
    service = new VaultService(adapter);
    await service.init();
  });

  it('creates a vault and persists only wrapped material', async () => {
    await service.create(PASS, WEBID);
    const dump = JSON.stringify(adapter.dump());
    expect(dump).toContain('wrappedMasterKey');
    expect(dump).not.toContain(PASS);
    expect(await service.exists()).toBe(true);
  });

  it('refuses to overwrite an existing vault', async () => {
    await service.create(PASS, WEBID);
    await expect(service.create(PASS, WEBID)).rejects.toThrow('vault-sudah-ada');
  });

  it('unlocks with the right passphrase and locks cleanly', async () => {
    await service.create(PASS, WEBID);
    service.lock();
    expect(service.isUnlocked).toBe(false);
    await expect(service.readFile('x')).rejects.toThrow('terkunci');
    await service.unlock(PASS);
    expect(service.isUnlocked).toBe(true);
    expect(service.webId).toBe(WEBID);
  });

  it('stores, reads, and deletes an encrypted document', async () => {
    await service.create(PASS, WEBID);
    const file = pdf('sertifikat.pdf', 'RAHASIA-NEGARA');
    const record = await service.addFile(file, 'aset', ['tanah']);

    const stored = JSON.stringify(adapter.dump());
    expect(stored).not.toContain('RAHASIA-NEGARA');
    expect(record.sha256).toHaveLength(64);
    expect(record.category).toBe('aset');

    const listed = await service.listFiles();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(record.id);

    const { bytes } = await service.readFile(record.id);
    expect(new TextDecoder().decode(bytes)).toContain('RAHASIA-NEGARA');
  });

  it('rejects an identical document (anti-duplikasi)', async () => {
    await service.create(PASS, WEBID);
    const file = pdf('a.pdf', 'SAMA');
    const first = await service.addFile(file, 'aset');
    await expect(service.addFile(pdf('b.pdf', 'SAMA'), 'aset')).rejects.toBeInstanceOf(DuplicateFileError);
    try {
      await service.addFile(pdf('b.pdf', 'SAMA'), 'aset');
    } catch (err) {
      expect((err as DuplicateFileError).existing.id).toBe(first.id);
    }
  });

  it('updates metadata without touching the ciphertext', async () => {
    await service.create(PASS, WEBID);
    const record = await service.addFile(pdf('lama.pdf', 'ISI'), 'kesehatan');
    const updated = await service.updateFile(record.id, { name: 'baru.pdf', category: 'finansial' });
    expect(updated.name).toBe('baru.pdf');
    expect(updated.cipher).toEqual(record.cipher);
    expect(updated.updatedAt >= record.updatedAt).toBe(true);
  });

  it('deletes a document and keeps the audit chain valid', async () => {
    await service.create(PASS, WEBID);
    const record = await service.addFile(pdf('hapus.pdf', 'ISI'), 'lainnya');
    await service.deleteFile(record.id);
    expect(await service.listFiles()).toHaveLength(0);
    expect(await verifyAudit(await service.readAudit())).toBe(true);
  });

  it('writes a JSON-LD manifest and a Turtle projection', async () => {
    await service.create(PASS, WEBID);
    await service.addFile(pdf('manifest.pdf', 'ISI'), 'aset');
    const jsonld = await adapter.readText(PATHS.manifest);
    const ttl = await adapter.readText('/vault/manifest.ttl');
    expect(jsonld).toContain('pv:Vault');
    expect(jsonld).not.toContain('wrappedKey');
    expect(ttl).toContain('@prefix pv:');
  });

  it('changes the passphrase without losing access to files', async () => {
    await service.create(PASS, WEBID);
    const record = await service.addFile(pdf('x.pdf', 'TETAP'), 'aset');
    await service.changePassphrase('passphrase-baru-yang-panjang');
    service.lock();
    await expect(service.unlock(PASS)).rejects.toThrow('passphrase-salah');
    await service.unlock('passphrase-baru-yang-panjang');
    const { bytes } = await service.readFile(record.id);
    expect(new TextDecoder().decode(bytes)).toContain('TETAP');
  });

  it('searches and groups records', async () => {
    await service.create(PASS, WEBID);
    await service.addFile(pdf('ktp.pdf', 'A'), 'kependudukan', ['identitas']);
    await service.addFile(pdf('polis.pdf', 'B'), 'finansial', ['asuransi']);
    const files = await service.listFiles();

    expect(searchFiles(files, 'ktp')).toHaveLength(1);
    expect(searchFiles(files, 'asuransi')).toHaveLength(1);
    expect(searchFiles(files, 'finansial')).toHaveLength(1);
    expect(searchFiles(files, '')).toHaveLength(2);

    const groups = groupByCategory(files);
    expect(groups.map((g) => g.id).sort()).toEqual(['finansial', 'kependudukan']);
  });
});
