import { describe, expect, it } from 'vitest';
import { combineShares, splitSecret, type Share } from './shamir.js';
import { randomBytes } from './bytes.js';

const SECRET = new Uint8Array(Array.from({ length: 32 }, (_, i) => (i * 7 + 3) & 0xff));

function subsets<T>(items: T[], k: number): T[][] {
  const out: T[][] = [];
  const walk = (start: number, acc: T[]): void => {
    if (acc.length === k) {
      out.push([...acc]);
      return;
    }
    for (let i = start; i < items.length; i++) walk(i + 1, [...acc, items[i] as T]);
  };
  walk(0, []);
  return out;
}

describe('shamir secret sharing (GF 256)', () => {
  it('reconstructs from every 3-subset of a 3-of-5 split', () => {
    const shares = splitSecret(SECRET, 3, 5);
    expect(shares).toHaveLength(5);
    expect(new Set(shares.map((s) => s.x)).size).toBe(5);
    for (const combo of subsets(shares, 3)) {
      expect(Array.from(combineShares(combo))).toEqual(Array.from(SECRET));
    }
  });

  it('does not reveal the secret with fewer than threshold shares', () => {
    const shares = splitSecret(SECRET, 3, 5);
    for (const combo of subsets(shares, 2)) {
      expect(Array.from(combineShares(combo))).not.toEqual(Array.from(SECRET));
    }
  });

  it('works with the exact threshold and with more shares', () => {
    const shares = splitSecret(SECRET, 4, 6);
    expect(Array.from(combineShares(shares.slice(0, 4)))).toEqual(Array.from(SECRET));
    expect(Array.from(combineShares(shares))).toEqual(Array.from(SECRET));
    expect(Array.from(combineShares([shares[5]!, shares[0]!, shares[3]!, shares[1]!]))).toEqual(
      Array.from(SECRET),
    );
  });

  it('is deterministic with an injected RNG', () => {
    const rand = (n: number): Uint8Array => new Uint8Array(n).fill(9);
    const a = splitSecret(SECRET, 3, 5, rand);
    const b = splitSecret(SECRET, 3, 5, rand);
    expect(a).toEqual(b);
    expect(Array.from(combineShares(a.slice(0, 3)))).toEqual(Array.from(SECRET));
  });

  it('handles a 1-of-1 split', () => {
    const shares = splitSecret(SECRET, 1, 1);
    expect(Array.from(combineShares([shares[0]!]))).toEqual(Array.from(SECRET));
  });

  it('rejects invalid parameters', () => {
    expect(() => splitSecret(SECRET, 0, 5)).toThrow();
    expect(() => splitSecret(SECRET, 4, 3)).toThrow();
    expect(() => splitSecret(SECRET, 2, 256)).toThrow();
    expect(() => splitSecret(new Uint8Array(0), 2, 3)).toThrow();
    expect(() => combineShares([{ x: 1, y: 'AA' }, { x: 1, y: 'AA' }])).toThrow();
    expect(() => combineShares([{ x: 1, y: 'AA' }, { x: 2, y: 'AAA' }])).toThrow();
    expect(combineShares([{ x: 1, y: 'AA' }])).toHaveLength(1);
    expect(() => combineShares([])).toThrow();
  });

  it('roundtrips random 32-byte secrets repeatedly', () => {
    for (let i = 0; i < 25; i++) {
      const secret = randomBytes(32);
      const shares: Share[] = splitSecret(secret, 3, 5);
      const picked = [shares[4]!, shares[1]!, shares[3]!];
      expect(Array.from(combineShares(picked))).toEqual(Array.from(secret));
    }
  });
});
