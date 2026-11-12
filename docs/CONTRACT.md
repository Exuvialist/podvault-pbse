# PodVault MVP — Module Contract (frozen)

Implement exactly these signatures. Do not rename or change shapes without updating this file.

## src/core/bytes.ts
```ts
export function randomBytes(n: number): Uint8Array;
export function toB64u(input: Uint8Array | ArrayBuffer): string;
export function fromB64u(s: string): Uint8Array;
export function utf8(s: string): Uint8Array;
export function fromUtf8(input: Uint8Array | ArrayBuffer): string;
export function concat(...parts: Uint8Array[]): Uint8Array;
export function toHex(bytes: Uint8Array): string;
export function equalBytes(a: Uint8Array, b: Uint8Array): boolean;
export function wipe(...bufs: Uint8Array[]): void;
```

## src/core/crypto.ts
```ts
export const PBKDF2_ITERATIONS = 600_000;
export async function deriveKek(passphrase: string, salt: Uint8Array, iterations?: number): Promise<CryptoKey>;
export async function newAesKey(): Promise<{ key: CryptoKey; raw: Uint8Array }>;
export async function importAesKey(raw: Uint8Array): Promise<CryptoKey>;
export async function exportAesKey(key: CryptoKey): Promise<Uint8Array>;
export async function seal(key: CryptoKey, plaintext: Uint8Array, aad?: Uint8Array): Promise<Sealed>;
export async function open(key: CryptoKey, sealed: Sealed, aad?: Uint8Array): Promise<Uint8Array>;
export async function sha256(data: Uint8Array): Promise<Uint8Array>;
export async function sha256Hex(data: Uint8Array): Promise<string>;
export async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array>;
export function constantTimeEqualHex(a: string, b: string): boolean;
```
Rules: AES-GCM 256, 12-byte IV, WebCrypto only. `open` must throw `Error('integrity')` when the tag fails.

## src/core/keys.ts
```ts
export async function createVault(passphrase: string, webId: string, settings?: Partial<VaultSettings>): Promise<{ config: VaultConfig; masterKey: CryptoKey; masterKeyRaw: Uint8Array }>;
export async function unlockVault(config: VaultConfig, passphrase: string): Promise<{ masterKey: CryptoKey; masterKeyRaw: Uint8Array }>;
export async function unlockWithMasterKeyRaw(raw: Uint8Array): Promise<CryptoKey>;
export async function changePassphrase(config: VaultConfig, masterKeyRaw: Uint8Array, newPassphrase: string): Promise<VaultConfig>;
export async function wrapFileKey(masterKey: CryptoKey, fkRaw: Uint8Array): Promise<Sealed>;
export async function unwrapFileKey(masterKey: CryptoKey, sealed: Sealed): Promise<CryptoKey>;
export async function sealFile(masterKey: CryptoKey, plaintext: Uint8Array): Promise<{ cipher: Sealed; wrappedKey: Sealed; sha256: string }>;
export async function openFile(masterKey: CryptoKey, rec: Pick<FileRecord, 'cipher' | 'wrappedKey' | 'sha256'>): Promise<Uint8Array>;
export async function fingerprint(raw: Uint8Array): Promise<string>;
```
`openFile` verifies SHA-256 and throws `Error('integrity')` on mismatch.

## src/core/shamir.ts
```ts
export interface Share { x: number; y: string }
export function splitSecret(secret: Uint8Array, threshold: number, total: number, rand?: (n: number) => Uint8Array): Share[];
export function combineShares(shares: Share[]): Uint8Array;
```
GF(256), polynomial 0x11B, y base64url, same length as secret. Throw on invalid params or mismatched share lengths.

## src/core/manifest.ts
```ts
export function buildManifest(config: VaultConfig, files: FileRecord[]): Record<string, unknown>;
export function manifestToTurtle(manifest: Record<string, unknown>): string;
```
JSON-LD with `@context` (`https://www.w3.org/ns/solid/terms#`, schema.org), vault WebID, and per-file nodes with only non-secret metadata (id, name, category, size, sha256, createdAt). Never include keys or ciphertext.

## src/core/audit.ts
```ts
export async function appendAudit(events: AuditEvent[], actor: string, action: string, target: string, detail?: string): Promise<AuditEvent[]>;
export async function verifyAudit(events: AuditEvent[]): Promise<boolean>;
```
Hash = sha256Hex(prevHash + '|' + canonical(payload)), prevHash of first event = 64 zeros.

## src/core/expiry.ts
```ts
export function shareExpiry(hours: number, now?: Date): string;
export function isExpired(share: Pick<ShareRecord, 'expiresAt' | 'revoked'>, now?: Date): boolean;
export function humanizeRemaining(expiresAt: string, now?: Date): string;
```

## src/storage/adapter.ts
```ts
export interface StorageAdapter {
  readonly kind: StorageKind;
  readonly label: string;
  init(): Promise<void>;
  readText(path: string): Promise<string | null>;
  writeText(path: string, text: string): Promise<void>;
  remove(path: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
}
export class StorageError extends Error { code: 'auth' | 'network' | 'notfound' | 'conflict' | 'unknown'; status?: number }
```

## src/storage/local.ts
`export class LocalAdapter implements StorageAdapter` — IndexedDB db `podvault`, store `kv`. kind `'local'`, label `'Perangkat ini (IndexedDB)'`.

## src/storage/memory.ts
`export class MemoryAdapter implements StorageAdapter` — Map-based, for tests.

## src/storage/solid.ts
```ts
export interface SolidOptions { baseUrl: string; webId: string; token?: string; fetchImpl?: typeof fetch }
export class SolidAdapter implements StorageAdapter // kind 'solid'
```
PUT/GET/DELETE on `${baseUrl}${path}`, `Authorization: Bearer` when token set, JSON content type. 404 → null; 401/403 → StorageError('auth'); network → StorageError('network'). `list(prefix)` GETs the container with `Accept: text/turtle` and extracts child IRIs with a documented light regex parse.

## src/storage/config.ts
```ts
export interface StoredSettings { podUrl: string; webId: string; token: string; watermarkIp: boolean; autoLockSeconds: number }
export function loadSettings(): StoredSettings;
export function saveSettings(s: StoredSettings): void;
export function clearSettings(): void;
export const DEFAULT_SETTINGS: StoredSettings;
```

## UI foundation
- `src/ui/dom.ts`: `el<K extends keyof HTMLElementTagNameMap>(tag, attrs?, ...children)`, `qs`, `mount`, `toast(message, kind)`, `modal({title, body, actions})`, `formatBytes`, `formatDate`, `icon(name)`.
- `src/ui/shell.ts`: `renderShell(active: string): { root: HTMLElement; outlet: HTMLElement }` — topbar + sidebar + `<main id="outlet">`; sidebar items: Vault, Berbagi, Pemulihan, Pengaturan.
- `src/ui/styles.css`: dark, high-contrast, 8pt spacing, tokens in `:root`. No framework.
