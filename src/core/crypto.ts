/**
 * WebCrypto primitives. AES-GCM-256 with a 12-byte IV and optional AAD.
 * Nothing here ever touches persistent storage; callers decide where ciphertext goes.
 */
import type { Sealed } from './types.js';
import { fromB64u, randomBytes, toB64u, utf8 } from './bytes.js';

export const PBKDF2_ITERATIONS = 600_000;
const IV_BYTES = 12;

/** Copy into a plain ArrayBuffer so WebCrypto never sees a SharedArrayBuffer-backed view. */
function buf(b: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(b.byteLength);
  new Uint8Array(out).set(b);
  return out;
}

export async function deriveKek(
  passphrase: string,
  salt: Uint8Array,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', buf(utf8(passphrase)), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: buf(salt), iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function newAesKey(): Promise<{ key: CryptoKey; raw: Uint8Array }> {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key));
  return { key, raw };
}

export async function importAesKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', buf(raw), { name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
}

export async function exportAesKey(key: CryptoKey): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.exportKey('raw', key));
}

export async function seal(key: CryptoKey, plaintext: Uint8Array, aad?: Uint8Array): Promise<Sealed> {
  const iv = randomBytes(IV_BYTES);
  const algo: AesGcmParams = { name: 'AES-GCM', iv: buf(iv) };
  if (aad) algo.additionalData = buf(aad);
  const ct = await crypto.subtle.encrypt(algo, key, buf(plaintext));
  return { iv: toB64u(iv), ct: toB64u(new Uint8Array(ct)) };
}

export async function open(key: CryptoKey, sealed: Sealed, aad?: Uint8Array): Promise<Uint8Array> {
  const iv = fromB64u(sealed.iv);
  if (iv.length !== IV_BYTES) throw new Error('integrity');
  const algo: AesGcmParams = { name: 'AES-GCM', iv: buf(iv) };
  if (aad) algo.additionalData = buf(aad);
  try {
    const pt = await crypto.subtle.decrypt(algo, key, buf(fromB64u(sealed.ct)));
    return new Uint8Array(pt);
  } catch {
    // Wrong key, tampered ciphertext, or wrong AAD all land here by design.
    throw new Error('integrity');
  }
}

export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', buf(data)));
}

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await sha256(data);
  let s = '';
  for (let i = 0; i < digest.length; i++) s += (digest[i] as number).toString(16).padStart(2, '0');
  return s;
}

export async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', buf(key), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, buf(data)));
}

/** Compare two hex digests without early exit on the first differing nibble. */
export function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
