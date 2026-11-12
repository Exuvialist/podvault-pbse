import { describe, expect, it } from 'vitest';
import { humanizeRemaining, isExpired, shareExpiry } from './expiry.js';

const NOW = new Date('2026-03-01T12:00:00.000Z');

describe('share expiry', () => {
  it('computes expiry from hours', () => {
    expect(shareExpiry(1, NOW)).toBe('2026-03-01T13:00:00.000Z');
    expect(shareExpiry(24, NOW)).toBe('2026-03-02T12:00:00.000Z');
  });

  it('treats the exact expiry instant as expired', () => {
    expect(isExpired({ expiresAt: NOW.toISOString(), revoked: false }, NOW)).toBe(true);
    expect(isExpired({ expiresAt: '2026-03-01T12:00:01.000Z', revoked: false }, NOW)).toBe(false);
  });

  it('treats revoked shares as expired regardless of time', () => {
    expect(isExpired({ expiresAt: '2030-01-01T00:00:00.000Z', revoked: true }, NOW)).toBe(true);
  });

  it('treats unparseable dates as expired', () => {
    expect(isExpired({ expiresAt: 'bukan-tanggal', revoked: false }, NOW)).toBe(true);
  });

  it('humanizes remaining time', () => {
    expect(humanizeRemaining('2026-03-01T14:05:00.000Z', NOW)).toBe('2 jam 5 menit');
    expect(humanizeRemaining('2026-03-01T12:45:00.000Z', NOW)).toBe('45 menit');
    expect(humanizeRemaining('2026-03-01T12:00:30.000Z', NOW)).toBe('30 detik');
    expect(humanizeRemaining('2026-03-01T11:00:00.000Z', NOW)).toBe('kedaluwarsa');
  });
});
