import type { FileRecord, Sealed, VaultConfig, VaultSettings } from './types.js';
import { PBKDF2_ITERATIONS, deriveKek, importAesKey, newAesKey, open, seal, sha256Hex } from './crypto.js';
import { fromB64u, randomBytes, toB64u, wipe } from './bytes.js';

export const DEFAULT_VAULT_SETTINGS: VaultSettings = { watermarkIp: false, autoLockSeconds: 300 };

export interface UnlockedKeys {
  masterKey: CryptoKey;
  masterKeyRaw: Uint8Array;
}

export async function createVault(
  passphrase: string,
  webId: string,
  settings: Partial<VaultSettings> = {},
): Promise<{ config: VaultConfig } & UnlockedKeys> {
  const salt = randomBytes(16);
  const kek = await deriveKek(passphrase, salt, PBKDF2_ITERATIONS);
  const { key: masterKey, raw: masterKeyRaw } = await newAesKey();
  const wrappedMasterKey = await seal(kek, masterKeyRaw);

  const config: VaultConfig = {
    version: 1,
    webId,
    createdAt: new Date().toISOString(),
    kdf: { name: 'PBKDF2-SHA256', iterations: PBKDF2_ITERATIONS, salt: toB64u(salt) },
    wrappedMasterKey,
    settings: { ...DEFAULT_VAULT_SETTINGS, ...settings },
  };
  return { config, masterKey, masterKeyRaw };
}

export async function unlockVault(config: VaultConfig, passphrase: string): Promise<UnlockedKeys> {
  const kek = await deriveKek(passphrase, fromB64u(config.kdf.salt), config.kdf.iterations);
  let raw: Uint8Array;
  try {
    raw = await open(kek, config.wrappedMasterKey);
  } catch {
    throw new Error('passphrase-salah');
  }
  return { masterKey: await importAesKey(raw), masterKeyRaw: raw };
}

/** Recovery-sheet path: the shares reconstruct MK directly, no passphrase involved. */
export async function unlockWithMasterKeyRaw(raw: Uint8Array): Promise<CryptoKey> {
  if (raw.length !== 32) throw new Error('kunci-tidak-valid');
  return importAesKey(raw);
}

export async function changePassphrase(
  config: VaultConfig,
  masterKeyRaw: Uint8Array,
  newPassphrase: string,
): Promise<VaultConfig> {
  const salt = randomBytes(16);
  const kek = await deriveKek(newPassphrase, salt, PBKDF2_ITERATIONS);
  const wrappedMasterKey = await seal(kek, masterKeyRaw);
  return {
    ...config,
    kdf: { name: 'PBKDF2-SHA256', iterations: PBKDF2_ITERATIONS, salt: toB64u(salt) },
    wrappedMasterKey,
  };
}

export async function wrapFileKey(masterKey: CryptoKey, fkRaw: Uint8Array): Promise<Sealed> {
  return seal(masterKey, fkRaw);
}

export async function unwrapFileKey(masterKey: CryptoKey, sealed: Sealed): Promise<CryptoKey> {
  const raw = await open(masterKey, sealed);
  const key = await importAesKey(raw);
  wipe(raw);
  return key;
}

export async function sealFile(
  masterKey: CryptoKey,
  plaintext: Uint8Array,
): Promise<{ cipher: Sealed; wrappedKey: Sealed; sha256: string }> {
  const { key: fileKey, raw: fkRaw } = await newAesKey();
  const cipher = await seal(fileKey, plaintext);
  const wrappedKey = await wrapFileKey(masterKey, fkRaw);
  wipe(fkRaw);
  return { cipher, wrappedKey, sha256: await sha256Hex(plaintext) };
}

export async function openFile(
  masterKey: CryptoKey,
  rec: Pick<FileRecord, 'cipher' | 'wrappedKey' | 'sha256'>,
): Promise<Uint8Array> {
  const fileKey = await unwrapFileKey(masterKey, rec.wrappedKey);
  const bytes = await open(fileKey, rec.cipher);
  const digest = await sha256Hex(bytes);
  if (digest !== rec.sha256) {
    wipe(bytes);
    throw new Error('integrity');
  }
  return bytes;
}

export async function fingerprint(raw: Uint8Array): Promise<string> {
  return (await sha256Hex(raw)).slice(0, 16);
}
