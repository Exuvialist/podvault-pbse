import type { ShareRecord } from './types.js';

export function shareExpiry(hours: number, now: Date = new Date()): string {
  return new Date(now.getTime() + hours * 3_600_000).toISOString();
}

export function isExpired(share: Pick<ShareRecord, 'expiresAt' | 'revoked'>, now: Date = new Date()): boolean {
  if (share.revoked) return true;
  const at = Date.parse(share.expiresAt);
  return !Number.isFinite(at) || now.getTime() >= at;
}

export function humanizeRemaining(expiresAt: string, now: Date = new Date()): string {
  const ms = Date.parse(expiresAt) - now.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 'kedaluwarsa';
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours} jam ${minutes} menit`;
  if (minutes > 0) return `${minutes} menit`;
  return `${seconds} detik`;
}
