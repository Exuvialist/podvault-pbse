import type { StorageKind } from '../core/types.js';

export type StorageErrorCode = 'auth' | 'network' | 'notfound' | 'conflict' | 'unknown';

export class StorageError extends Error {
  constructor(
    readonly code: StorageErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

/**
 * The vault only needs a tiny key-value surface. Paths are absolute-looking
 * ('/vault/files/x.json'); adapters decide how to map them.
 */
export interface StorageAdapter {
  readonly kind: StorageKind;
  readonly label: string;
  init(): Promise<void>;
  readText(path: string): Promise<string | null>;
  writeText(path: string, text: string): Promise<void>;
  remove(path: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
}
