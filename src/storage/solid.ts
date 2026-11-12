import type { StorageKind } from '../core/types.js';
import { StorageError, type StorageAdapter } from './adapter.js';

export interface SolidOptions {
  baseUrl: string;
  webId: string;
  token?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Minimal Solid/LDP adapter: one resource per JSON document.
 *
 * Phase 1 auth is a manually supplied Bearer token (or none, for a public Pod).
 * Solid-OIDC + DPoP belong to Phase 2; the call site only needs an authorized fetch.
 */
export class SolidAdapter implements StorageAdapter {
  readonly kind: StorageKind = 'solid';
  readonly label: string;
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: SolidOptions) {
    this.base = opts.baseUrl.replace(/\/+$/, '');
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
    let host = opts.baseUrl;
    try {
      host = new URL(opts.baseUrl).host;
    } catch {
      /* keep the raw string for the label */
    }
    this.label = `Solid Pod · ${host}`;
  }

  async init(): Promise<void> {
    if (!/^https?:\/\//i.test(this.base)) throw new StorageError('unknown', 'URL Pod tidak valid');
  }

  private url(path: string): string {
    return `${this.base}${path.startsWith('/') ? path : `/${path}`}`;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    const headers: Record<string, string> = { ...extra };
    if (this.opts.token) headers.Authorization = `Bearer ${this.opts.token}`;
    return headers;
  }

  private async send(path: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchImpl(this.url(path), init);
    } catch (err) {
      throw new StorageError('network', `Tidak dapat menghubungi Pod: ${(err as Error).message}`);
    }
  }

  private fail(status: number, action: string): never {
    if (status === 401 || status === 403) throw new StorageError('auth', `${action}: akses ditolak`, status);
    if (status === 409 || status === 412) throw new StorageError('conflict', `${action}: konflik versi`, status);
    if (status === 404 || status === 410) throw new StorageError('notfound', `${action}: tidak ditemukan`, status);
    throw new StorageError('unknown', `${action}: status ${status}`, status);
  }

  async readText(path: string): Promise<string | null> {
    const res = await this.send(path, {
      method: 'GET',
      headers: this.headers({ Accept: 'application/json' }),
    });
    if (res.status === 404 || res.status === 410) return null;
    if (!res.ok) this.fail(res.status, 'Baca');
    const text = await res.text();
    return text.length ? text : null;
  }

  async writeText(path: string, text: string): Promise<void> {
    const res = await this.send(path, {
      method: 'PUT',
      headers: this.headers({ 'Content-Type': 'application/json; charset=utf-8' }),
      body: text,
    });
    if (!res.ok) this.fail(res.status, 'Tulis');
  }

  /** Idempotent: deleting something that is already gone is not an error. */
  async remove(path: string): Promise<void> {
    const res = await this.send(path, { method: 'DELETE', headers: this.headers() });
    if (res.ok || res.status === 404 || res.status === 410) return;
    this.fail(res.status, 'Hapus');
  }

  /**
   * Light Turtle parse: collects every `<IRI>` in the container document.
   * It is not a full parser; a Pod that returns JSON-LD instead is not supported yet.
   */
  async list(prefix: string): Promise<string[]> {
    const containerPath = prefix.endsWith('/') ? prefix : `${prefix}/`;
    const res = await this.send(containerPath, {
      method: 'GET',
      headers: this.headers({ Accept: 'text/turtle' }),
    });
    if (res.status === 404 || res.status === 410) return [];
    if (!res.ok) this.fail(res.status, 'Daftar');
    const body = await res.text();
    const containerUrl = this.url(containerPath);

    const out = new Set<string>();
    for (const match of body.matchAll(/<([^>\s]+)>/g)) {
      const iri = match[1] as string;
      if (!iri.startsWith(containerUrl) || iri === containerUrl) continue;
      try {
        out.add(new URL(iri).pathname);
      } catch {
        /* skip malformed */
      }
    }
    return [...out].sort();
  }
}
