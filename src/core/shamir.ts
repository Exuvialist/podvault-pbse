/**
 * Shamir's Secret Sharing over GF(256), reduction polynomial 0x11B.
 * A 32-byte master key becomes `total` paper shares; any `threshold` reconstruct it.
 */
import { fromB64u, randomBytes, toB64u } from './bytes.js';

export interface Share {
  /** 1..255 */
  x: number;
  /** base64url, same length as the secret */
  y: string;
}

/** Carry-less multiply in GF(2^8), reduction polynomial 0x11B. */
function mul(a: number, b: number): number {
  let p = 0;
  let x = a & 0xff;
  let y = b & 0xff;
  for (let i = 0; i < 8; i++) {
    if (y & 1) p ^= x;
    const hi = x & 0x80;
    x = (x << 1) & 0xff;
    if (hi) x ^= 0x1b;
    y >>= 1;
  }
  return p & 0xff;
}

function pow(a: number, e: number): number {
  let result = 1;
  let base = a;
  let exp = e;
  while (exp > 0) {
    if (exp & 1) result = mul(result, base);
    base = mul(base, base);
    exp >>= 1;
  }
  return result;
}

function div(a: number, b: number): number {
  if (b === 0) throw new Error('pembagian-nol');
  if (a === 0) return 0;
  // b^254 is the multiplicative inverse of b in GF(256).
  return mul(a, pow(b, 254));
}

function validate(threshold: number, total: number): void {
  if (!Number.isInteger(threshold) || !Number.isInteger(total)) throw new Error('parameter-bukan-bulat');
  if (threshold < 1) throw new Error('ambang-minimal-1');
  if (total < threshold) throw new Error('jumlah-lembar-kurang-dari-ambang');
  if (total > 255) throw new Error('jumlah-lembar-maksimal-255');
}

export function splitSecret(
  secret: Uint8Array,
  threshold: number,
  total: number,
  rand: (n: number) => Uint8Array = randomBytes,
): Share[] {
  validate(threshold, total);
  if (secret.length === 0) throw new Error('secret-kosong');

  const xs = Array.from({ length: total }, (_, i) => i + 1);
  const ys = xs.map(() => new Uint8Array(secret.length));

  for (let i = 0; i < secret.length; i++) {
    const coeffs = new Uint8Array(threshold);
    coeffs[0] = secret[i] as number;
    if (threshold > 1) {
      const noise = rand(threshold - 1);
      if (noise.length !== threshold - 1) throw new Error('rand-panjang-salah');
      for (let j = 1; j < threshold; j++) coeffs[j] = noise[j - 1] as number;
    }
    for (let s = 0; s < total; s++) {
      const x = xs[s] as number;
      let y = 0;
      for (let j = threshold - 1; j >= 0; j--) y = mul(y, x) ^ (coeffs[j] as number);
      (ys[s] as Uint8Array)[i] = y;
    }
  }

  return xs.map((x, idx) => ({ x, y: toB64u(ys[idx] as Uint8Array) }));
}

export function combineShares(shares: Share[]): Uint8Array {
  if (shares.length < 1) throw new Error('butuh-minimal-1-share');

  const xs = shares.map((s) => s.x);
  if (new Set(xs).size !== xs.length) throw new Error('share-duplikat');
  for (const x of xs) {
    if (!Number.isInteger(x) || x < 1 || x > 255) throw new Error('share-x-tidak-valid');
  }

  const parts = shares.map((s) => fromB64u(s.y));
  const len = (parts[0] as Uint8Array).length;
  if (len === 0) throw new Error('share-kosong');
  if (parts.some((p) => p.length !== len)) throw new Error('panjang-share-berbeda');

  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    let acc = 0;
    for (let j = 0; j < xs.length; j++) {
      let num = 1;
      let den = 1;
      for (let m = 0; m < xs.length; m++) {
        if (m === j) continue;
        num = mul(num, xs[m] as number);
        den = mul(den, (xs[m] as number) ^ (xs[j] as number));
      }
      acc ^= mul((parts[j] as Uint8Array)[i] as number, div(num, den));
    }
    out[i] = acc;
  }
  return out;
}
