import { describe, expect, it } from 'vitest';
import {
  createRecoveryKit,
  encodeShare,
  parseShare,
  parseShares,
  recoverMasterKeyRaw,
} from './recovery.js';
import { createVault } from '../core/keys.js';

const PASS = 'passphrase-uji-yang-panjang';

async function session() {
  const created = await createVault(PASS, 'https://demo.pod/profile#me');
  return { config: created.config, masterKey: created.masterKey, masterKeyRaw: created.masterKeyRaw };
}

describe('recovery kit', () => {
  it('splits MK into a 3-of-5 kit with a fingerprint', async () => {
    const s = await session();
    const kit = await createRecoveryKit(s, 3, 5);
    expect(kit.shares).toHaveLength(5);
    expect(kit.threshold).toBe(3);
    expect(kit.fingerprint).toHaveLength(16);
    expect(kit.webId).toBe(s.config.webId);
  });

  it('restores MK from any 3 printed codes', async () => {
    const s = await session();
    const kit = await createRecoveryKit(s, 3, 5);
    const printed = kit.shares.map(encodeShare).join('\n');
    const parsed = parseShares(printed);
    expect(parsed).toHaveLength(5);

    for (const combo of [
      [0, 1, 2],
      [0, 3, 4],
      [2, 3, 4],
    ]) {
      const raw = await recoverMasterKeyRaw(combo.map((i) => parsed[i]!));
      expect(Array.from(raw)).toEqual(Array.from(s.masterKeyRaw));
    }
  });

  it('does not reveal MK with only 2 codes', async () => {
    const s = await session();
    const kit = await createRecoveryKit(s, 3, 5);
    const raw = await recoverMasterKeyRaw(kit.shares.slice(0, 2));
    expect(Array.from(raw)).not.toEqual(Array.from(s.masterKeyRaw));
  });

  it('rejects malformed codes', () => {
    expect(() => parseShare('bukan-share')).toThrow('format-share-tidak-valid');
    expect(() => parseShare('podvault:share:v1:0:AAAA')).toThrow('format-share-tidak-valid');
    expect(() => parseShare('podvault:share:v1:300:AAAA')).toThrow('format-share-tidak-valid');
    expect(parseShares('  \n  ')).toEqual([]);
  });

  it('tolerates whitespace around codes', () => {
    const share = { x: 2, y: 'QUJD' };
    expect(parseShare(`  ${encodeShare(share)}  `)).toEqual(share);
  });

  it('needs at least two shares to attempt a restore', async () => {
    const s = await session();
    const kit = await createRecoveryKit(s, 3, 5);
    await expect(recoverMasterKeyRaw([kit.shares[0]!])).rejects.toThrow('butuh-minimal-2-share');
  });
});
