/**
 * PodVault - shared domain types.
 *
 * Key hierarchy (see docs/SECURITY.md):
 *   KEK  = PBKDF2(passphrase) or WebAuthn-PRF output      (never stored)
 *   MK   = random 32 bytes, wrapped by KEK -> vault config (stored)
 *   FK_i = random 32 bytes per file, wrapped by MK         (stored per file)
 *   file ciphertext = AES-GCM(FK_i, plaintext)
 */

export type CategoryId = 'kependudukan' | 'kesehatan' | 'finansial' | 'aset' | 'lainnya';

export interface Category {
  id: CategoryId;
  label: string;
  hint: string;
  icon: string;
}

export const CATEGORIES: readonly Category[] = [
  { id: 'kependudukan', label: 'Kependudukan', hint: 'KTP, KK, paspor, akta', icon: 'id-card' },
  { id: 'kesehatan', label: 'Kesehatan', hint: 'Rekam medis, hasil lab, resep', icon: 'heart' },
  { id: 'finansial', label: 'Finansial', hint: 'Polis, rekening, pajak', icon: 'wallet' },
  { id: 'aset', label: 'Kepemilikan Aset', hint: 'Sertifikat, BPKB, AJB', icon: 'home' },
  { id: 'lainnya', label: 'Lainnya', hint: 'Dokumen lain', icon: 'folder' },
];

export interface Sealed {
  /** base64url, 12-byte AES-GCM IV */
  iv: string;
  /** base64url ciphertext || tag */
  ct: string;
}

export interface KdfParams {
  name: 'PBKDF2-SHA256';
  iterations: number;
  /** base64url, 16-byte salt */
  salt: string;
}

export interface RecoveryParams {
  threshold: number;
  shares: number;
  createdAt: string;
  /** SHA-256 fingerprint (hex, first 16 chars) of MK, printed on the sheet for verification */
  fingerprint: string;
}

export interface VaultConfig {
  version: 1;
  webId: string;
  createdAt: string;
  kdf: KdfParams;
  /** MK wrapped by KEK */
  wrappedMasterKey: Sealed;
  recovery?: RecoveryParams;
  settings: VaultSettings;
}

export interface VaultSettings {
  /** Best-effort client IP in forensic watermark. Off by default: it calls a third party. */
  watermarkIp: boolean;
  /** Idle auto-lock in seconds (0 = disabled) */
  autoLockSeconds: number;
}

export interface FileRecord {
  id: string;
  name: string;
  mime: string;
  /** plaintext byte length */
  size: number;
  category: CategoryId;
  createdAt: string;
  updatedAt: string;
  /** SHA-256 of plaintext, hex */
  sha256: string;
  /** plaintext encrypted under FK */
  cipher: Sealed;
  /** FK wrapped by MK */
  wrappedKey: Sealed;
  tags: string[];
}

export interface ShareRecord {
  id: string;
  fileId: string;
  fileName: string;
  mime: string;
  size: number;
  createdAt: string;
  expiresAt: string;
  /** plaintext encrypted under a throwaway share key */
  cipher: Sealed;
  /** share key wrapped by passphrase KEK (only when a passphrase is used) */
  wrappedKey?: Sealed;
  /** share key wrapped by the owner's MK, so the owner can re-copy the link later */
  ownerWrappedKey?: Sealed;
  /** passphrase KDF params (only when a passphrase is used) */
  kdf?: KdfParams;
  revoked: boolean;
  /** how many times the share was opened (best effort, client side) */
  views: number;
}

export interface AuditEvent {
  seq: number;
  at: string;
  actor: string;
  action: string;
  target: string;
  detail?: string;
  /** SHA-256 of (prevHash + canonical payload), hex */
  hash: string;
  prevHash: string;
}

export interface VaultPaths {
  config: string;
  audit: string;
  file: (id: string) => string;
  share: (id: string) => string;
  manifest: string;
}

export const PATHS: VaultPaths = {
  config: '/vault/config.json',
  audit: '/vault/audit.json',
  file: (id) => `/vault/files/${id}.json`,
  share: (id) => `/vault/shares/${id}.json`,
  manifest: '/vault/manifest.jsonld',
};

export type StorageKind = 'local' | 'solid';
