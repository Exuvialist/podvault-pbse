import type { AuditEvent } from './types.js';
import { sha256Hex } from './crypto.js';
import { utf8 } from './bytes.js';

const GENESIS = '0'.repeat(64);

function payload(event: Pick<AuditEvent, 'actor' | 'action' | 'target' | 'detail' | 'at'>): string {
  return JSON.stringify([event.actor, event.action, event.target, event.detail ?? null, event.at]);
}

export async function appendAudit(
  events: AuditEvent[],
  actor: string,
  action: string,
  target: string,
  detail?: string,
): Promise<AuditEvent[]> {
  const last = events.at(-1);
  const at = new Date().toISOString();
  const prevHash = last?.hash ?? GENESIS;
  const seq = (last?.seq ?? 0) + 1;
  const hash = await sha256Hex(utf8(`${prevHash}|${payload({ actor, action, target, detail, at })}`));
  const event: AuditEvent = {
    seq,
    at,
    actor,
    action,
    target,
    hash,
    prevHash,
    ...(detail !== undefined ? { detail } : {}),
  };
  return [...events, event];
}

export async function verifyAudit(events: AuditEvent[]): Promise<boolean> {
  let prevHash = GENESIS;
  let expectedSeq = 1;
  for (const event of events) {
    if (event.seq !== expectedSeq || event.prevHash !== prevHash) return false;
    const hash = await sha256Hex(utf8(`${prevHash}|${payload(event)}`));
    if (hash !== event.hash) return false;
    prevHash = event.hash;
    expectedSeq++;
  }
  return true;
}
