import type { StorageKind } from '../core/types.js';
import type { StorageAdapter } from './adapter.js';

const DB_NAME = 'podvault';
const DB_VERSION = 1;
const STORE = 'kv';

/** Default storage: IndexedDB on this device. Survives reloads, never leaves the browser. */
export class LocalAdapter implements StorageAdapter {
  readonly kind: StorageKind = 'local';
  readonly label = 'Perangkat ini (IndexedDB)';
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    if (typeof indexedDB === 'undefined') throw new Error('IndexedDB tidak tersedia di lingkungan ini');
    this.db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('gagal-membuka-indexeddb'));
    });
  }

  private store(mode: IDBTransactionMode): IDBObjectStore {
    if (!this.db) throw new Error('adapter-belum-init');
    return this.db.transaction(STORE, mode).objectStore(STORE);
  }

  private static request<T>(req: IDBRequest<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('indexeddb-error'));
    });
  }

  async readText(path: string): Promise<string | null> {
    const value = await LocalAdapter.request<unknown>(this.store('readonly').get(path));
    return typeof value === 'string' ? value : null;
  }

  async writeText(path: string, text: string): Promise<void> {
    await LocalAdapter.request(this.store('readwrite').put(text, path));
  }

  async remove(path: string): Promise<void> {
    await LocalAdapter.request(this.store('readwrite').delete(path));
  }

  async list(prefix: string): Promise<string[]> {
    const keys = await LocalAdapter.request<IDBValidKey[]>(this.store('readonly').getAllKeys());
    return keys.filter((k): k is string => typeof k === 'string' && k.startsWith(prefix)).sort();
  }
}
