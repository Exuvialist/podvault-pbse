import { describe, expect, it } from 'vitest';
import { randomBytes } from './bytes.js';
import {
  changePassphrase,
  createVault,
  fingerprint,
  openFile,
  sealFile,
  unlockVault,
  unwrapFileKey,
  wrapFileKey,
} from './keys.js';

const PASS = 'passphrase-demo-yang-panjang';
const WEBID = 'https://demo.pod/profile/card#me';

describe('key hierarchy', () => {
  it('creates a vault and unlocks it with the same passphrase', async () => {
    const { config, masterKeyRaw } = await createVault(PASS, WEBID);
    expect(config.version).toBe(1);
    expect(config.webId).toBe(WEBID);
    expect(config.kdf.name).toBe('PBKDF2-SHA256');
    expect(config.kdf.iterations).toBe(600_000);
    expect(config.wrappedMasterKey.ct).not.toContain('passphrase');

    const { masterKeyRaw: recovered } = await unlockVault(config, PASS);
    expect(Array.from(recovered)).toEqual(Array.from(masterKeyRaw));
  });

  it('rejects a wrong passphrase with a clean error', async () => {
    const { config } = await createVault(PASS, WEBID);
    await expect(unlockVault(config, 'passphrase-yang-salah-sekali')).rejects.toThrow('passphrase-salah');
  });

  it('re-wraps MK on passphrase change without changing the key itself', async () => {
    const { config, masterKeyRaw } = await createVault(PASS, WEBID);
    const next = await changePassphrase(config, masterKeyRaw, 'passphrase-baru-yang-aman');

    expect(next.kdf.salt).not.toBe(config.kdf.salt);
    expect(next.wrappedMasterKey.ct).not.toBe(config.wrappedMasterKey.ct);
    expect(next.recovery).toBeUndefined();
    await expect(unlockVault(config, 'passphrase-baru-yang-aman')).rejects.toThrow('passphrase-salah');

    const { masterKeyRaw: recovered } = await unlockVault(next, 'passphrase-baru-yang-aman');
    expect(Array.from(recovered)).toEqual(Array.from(masterKeyRaw));
  });

  it('does not mutate the input config when changing passphrase', async () => {
    const { config, masterKeyRaw } = await createVault(PASS, WEBID);
    const snapshot = JSON.stringify(config);
    await changePassphrase(config, masterKeyRaw, 'lain-lagi-yang-panjang');
    expect(JSON.stringify(config)).toBe(snapshot);
  });
});

describe('file sealing', () => {
  it('roundtrips empty, tiny, and 200KB payloads', async () => {
    const { masterKey } = await createVault(PASS, WEBID);
    for (const size of [0, 1, 200 * 1024]) {
      const plaintext = randomBytes(size);
      const sealed = await sealFile(masterKey, plaintext);
      const opened = await openFile(masterKey, sealed);
      expect(opened.length).toBe(size);
      expect(Array.from(opened.slice(0, 16))).toEqual(Array.from(plaintext.slice(0, 16)));
      expect(sealed.sha256).toHaveLength(64);
    }
  });

  it('detects a tampered ciphertext', async () => {
    const { masterKey } = await createVault(PASS, WEBID);
    const sealed = await sealFile(masterKey, randomBytes(64));
    const bytes = Buffer.from(sealed.cipher.ct, 'base64url');
    bytes[0] = (bytes[0] ?? 0) ^ 0xff;
    const tampered = { ...sealed, cipher: { ...sealed.cipher, ct: bytes.toString('base64url') } };
    await expect(openFile(masterKey, tampered)).rejects.toThrow('integrity');
  });

  it('detects a tampered plaintext hash', async () => {
    const { masterKey } = await createVault(PASS, WEBID);
    const sealed = await sealFile(masterKey, randomBytes(32));
    await expect(openFile(masterKey, { ...sealed, sha256: '0'.repeat(64) })).rejects.toThrow('integrity');
  });

  it('cannot unwrap a file key with a different master key', async () => {
    const a = await createVault(PASS, WEBID);
    const b = await createVault(PASS, WEBID);
    const sealed = await sealFile(a.masterKey, randomBytes(32));
    await expect(openFile(b.masterKey, sealed)).rejects.toThrow('integrity');
  });

  it('wraps and unwraps a raw file key', async () => {
    const { masterKey } = await createVault(PASS, WEBID);
    const raw = randomBytes(32);
    const wrapped = await wrapFileKey(masterKey, raw);
    const key = await unwrapFileKey(masterKey, wrapped);
    const exported = new Uint8Array(await crypto.subtle.exportKey('raw', key));
    expect(Array.from(exported)).toEqual(Array.from(raw));
  });

  it('prints a stable 16-char fingerprint', async () => {
    const raw = randomBytes(32);
    const a = await fingerprint(raw);
    const b = await fingerprint(raw);
    expect(a).toBe(b);
    expect(a).toHaveLength(16);
  });
});
