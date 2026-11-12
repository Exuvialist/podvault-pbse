/** Byte helpers. All binary values crossing a boundary are base64url strings. */

export function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  // WebCrypto caps a single getRandomValues call at 65,536 bytes.
  for (let offset = 0; offset < n; offset += 65536) {
    crypto.getRandomValues(out.subarray(offset, Math.min(offset + 65536, n)));
  }
  return out;
}

export function toB64u(input: Uint8Array | ArrayBuffer): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i] as number);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64u(s: string): Uint8Array {
  const norm = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = norm.length % 4 === 0 ? '' : '='.repeat(4 - (norm.length % 4));
  const bin = atob(norm + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function utf8(s: string): Uint8Array {
  return encoder.encode(s);
}

export function fromUtf8(input: Uint8Array | ArrayBuffer): string {
  return decoder.decode(input instanceof Uint8Array ? input : new Uint8Array(input));
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

export function toHex(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += (bytes[i] as number).toString(16).padStart(2, '0');
  return s;
}

export function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] as number) ^ (b[i] as number);
  return diff === 0;
}

/** Best-effort zeroing of key material. JS strings cannot be wiped; Uint8Arrays can. */
export function wipe(...bufs: Uint8Array[]): void {
  for (const b of bufs) b.fill(0);
}
