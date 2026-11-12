import type { StorageKind } from '../core/types.js';
import type { StorageAdapter } from './adapter.js';

/** In-memory adapter for tests and for a throwaway demo session. */
export class MemoryAdapter implements StorageAdapter {
  readonly kind: StorageKind = 'local';
  readonly label = 'Memori (uji)';
  private readonly store = new Map<string, string>();

  async init(): Promise<void> {
    /* nothing to do */
  }

  async readText(path: string): Promise<string | null> {
    return this.store.get(path) ?? null;
  }

  async writeText(path: string, text: string): Promise<void> {
    this.store.set(path, text);
  }

  async remove(path: string): Promise<void> {
    this.store.delete(path);
  }

  async list(prefix: string): Promise<string[]> {
    return [...this.store.keys()].filter((k) => k.startsWith(prefix)).sort();
  }

  /** Test helper: snapshot of everything stored. */
  dump(): Record<string, string> {
    return Object.fromEntries(this.store);
  }
}
