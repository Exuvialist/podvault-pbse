import { describe, expect, it } from 'vitest';
import { buildManifest, manifestToTurtle } from './manifest.js';
import type { FileRecord, VaultConfig } from './types.js';

const config: VaultConfig = {
  version: 1,
  webId: 'https://demo.pod/profile/card#me',
  createdAt: '2026-01-01T00:00:00.000Z',
  kdf: { name: 'PBKDF2-SHA256', iterations: 600000, salt: 'c2FsdA' },
  wrappedMasterKey: { iv: 'aXZpdml2aXZpdg', ct: 'Y2lwaGVydGV4dA' },
  settings: { watermarkIp: false, autoLockSeconds: 300 },
};

function file(id: string, name: string): FileRecord {
  return {
    id,
    name,
    mime: 'application/pdf',
    size: 1234,
    category: 'aset',
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    sha256: 'ab'.repeat(32),
    cipher: { iv: 'aXZpdml2aXZpdg', ct: 'U0VDUkVULUNJUEhFUlRFWFQ' },
    wrappedKey: { iv: 'aXZpdml2aXZpdg', ct: 'V1JBUFBFRA' },
    tags: [],
  };
}

describe('manifest', () => {
  it('never leaks ciphertext, IVs, wrapped keys, or KDF material', () => {
    const json = JSON.stringify(buildManifest(config, [file('b', 'sertifikat.pdf'), file('a', 'polis.pdf')]));
    expect(json).not.toContain('U0VDUkVULUNJUEhFUlRFWFQ');
    expect(json).not.toContain('V1JBUFBFRA');
    expect(json).not.toContain('wrappedKey');
    expect(json).not.toContain('cipher');
    expect(json).not.toContain('PBKDF2');
    expect(json).not.toContain('salt');
  });

  it('is deterministic regardless of input order', () => {
    const a = buildManifest(config, [file('b', 'sertifikat.pdf'), file('a', 'polis.pdf')]);
    const b = buildManifest(config, [file('a', 'polis.pdf'), file('b', 'sertifikat.pdf')]);
    expect(a).toEqual(b);
    expect(a['pv:fileCount']).toBe(2);
  });

  it('emits Turtle with prefixes and every file node', () => {
    const turtle = manifestToTurtle(buildManifest(config, [file('a', 'polis.pdf')]));
    expect(turtle).toContain('@prefix pv:');
    expect(turtle).toContain('a pv:Vault');
    expect(turtle).toContain('https://demo.pod/profile/card#file-a');
    expect(turtle).toContain('schema:name "polis.pdf"');
    expect(turtle).toContain('pv:sha256');
  });

  it('escapes quotes and newlines in literals', () => {
    const turtle = manifestToTurtle(buildManifest(config, [file('x', 'nama "aneh"\nbaris')]));
    expect(turtle).toContain('nama \\"aneh\\"\\nbaris');
  });
});
