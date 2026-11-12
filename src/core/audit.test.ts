import { describe, expect, it } from 'vitest';
import { appendAudit, verifyAudit } from './audit.js';
import type { AuditEvent } from './types.js';

async function chain(): Promise<AuditEvent[]> {
  let events: AuditEvent[] = [];
  events = await appendAudit(events, 'https://demo.pod/#me', 'vault.create', 'vault');
  events = await appendAudit(events, 'https://demo.pod/#me', 'file.add', 'file-1', 'sertifikat.pdf (1024B)');
  events = await appendAudit(events, 'https://demo.pod/#me', 'file.view', 'file-1', 'sertifikat.pdf');
  return events;
}

describe('audit log', () => {
  it('builds a valid chain and does not mutate the input array', async () => {
    const first = await appendAudit([], 'a', 'x', 'y');
    expect(first).toHaveLength(1);
    const before = first.length;
    const second = await appendAudit(first, 'a', 'z', 'w');
    expect(first).toHaveLength(before);
    expect(second).toHaveLength(2);
    expect(second[1]?.prevHash).toBe(first[0]?.hash);
    expect(await verifyAudit(second)).toBe(true);
  });

  it('verifies a three-event chain', async () => {
    expect(await verifyAudit(await chain())).toBe(true);
  });

  it('detects a modified detail', async () => {
    const events = await chain();
    const tampered = events.map((e, i) => (i === 1 ? { ...e, detail: 'dipalsukan' } : e));
    expect(await verifyAudit(tampered)).toBe(false);
  });

  it('detects a removed event', async () => {
    const events = await chain();
    expect(await verifyAudit([events[0]!, events[2]!])).toBe(false);
  });

  it('detects reordering', async () => {
    const events = await chain();
    expect(await verifyAudit([events[1]!, events[0]!, events[2]!])).toBe(false);
  });

  it('detects a forged hash', async () => {
    const events = await chain();
    const forged = events.map((e, i) => (i === 0 ? { ...e, hash: 'f'.repeat(64) } : e));
    expect(await verifyAudit(forged)).toBe(false);
  });

  it('starts from the genesis hash', async () => {
    const events = await chain();
    expect(events[0]?.prevHash).toBe('0'.repeat(64));
    expect(events[0]?.seq).toBe(1);
  });
});
