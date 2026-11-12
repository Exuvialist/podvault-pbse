export interface StoredSettings {
  podUrl: string;
  webId: string;
  token: string;
  watermarkIp: boolean;
  autoLockSeconds: number;
}

export const DEFAULT_SETTINGS: StoredSettings = {
  podUrl: '',
  webId: '',
  token: '',
  watermarkIp: false,
  autoLockSeconds: 300,
};

const KEY = 'podvault.settings.v1';

function str(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback;
}

export function loadSettings(): StoredSettings {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const p = JSON.parse(raw) as Record<string, unknown>;
    return {
      podUrl: str(p.podUrl, DEFAULT_SETTINGS.podUrl),
      webId: str(p.webId, DEFAULT_SETTINGS.webId),
      token: str(p.token, DEFAULT_SETTINGS.token),
      watermarkIp: bool(p.watermarkIp, DEFAULT_SETTINGS.watermarkIp),
      autoLockSeconds: num(p.autoLockSeconds, DEFAULT_SETTINGS.autoLockSeconds),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: StoredSettings): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* storage full or blocked: settings stay in memory */
  }
}

export function clearSettings(): void {
  try {
    globalThis.localStorage?.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
