import './ui/styles.css';
import { LocalAdapter } from './storage/local.js';
import { SolidAdapter } from './storage/solid.js';
import type { StorageAdapter } from './storage/adapter.js';
import { loadSettings, saveSettings, type StoredSettings } from './storage/config.js';
import { VaultService } from './features/vault.js';
import { renderShell } from './ui/shell.js';
import { toast } from './ui/views/helpers.js';
import { unlockView } from './ui/views/unlock.js';
import { vaultView } from './ui/views/vault.js';
import { fileView } from './ui/views/file.js';
import { sharesView } from './ui/views/shares.js';
import { recoveryView } from './ui/views/recovery.js';
import { settingsView } from './ui/views/settings.js';
import { publicShareView } from './ui/views/public-share.js';

export interface AppContext {
  service: VaultService;
  adapter: StorageAdapter;
  settings: StoredSettings;
  storageLabel: string;
  navigate(route: string): void;
  rerender(): void;
  lock(): void;
  updateSettings(patch: Partial<StoredSettings>): void;
  setTitle(title: string): void;
  cleanup(fn: () => void): void;
}

interface Route {
  name: 'unlock' | 'vault' | 'file' | 'shares' | 'recovery' | 'settings' | 'share' | 'unknown';
  params: string[];
  query: URLSearchParams;
}

const ROUTE_TITLES: Record<string, string> = {
  vault: 'Brankas',
  file: 'Detail Dokumen',
  shares: 'Berbagi',
  recovery: 'Pemulihan',
  settings: 'Pengaturan',
  unlock: 'Kunci',
};

let service: VaultService;
let settings: StoredSettings;
let currentCleanup: (() => void) | null = null;
let renderToken = 0;
let lockTimer: number | undefined;

export async function boot(): Promise<void> {
  settings = loadSettings();
  const adapter = buildAdapter(settings);
  service = new VaultService(adapter);

  try {
    await service.init();
  } catch (err) {
    toast(`Penyimpanan tidak tersedia: ${(err as Error).message}`, 'err', 8000);
  }

  window.addEventListener('hashchange', () => void render());
  document.addEventListener('pointerdown', armAutoLock, { passive: true });
  document.addEventListener('keydown', armAutoLock);
  window.addEventListener('pagehide', () => service.lock());

  await render();
}

function buildAdapter(s: StoredSettings): StorageAdapter {
  const podUrl = s.podUrl.trim();
  if (podUrl) {
    return new SolidAdapter({
      baseUrl: podUrl,
      webId: s.webId,
      ...(s.token.trim() ? { token: s.token.trim() } : {}),
    });
  }
  return new LocalAdapter();
}

function parseRoute(): Route {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const [pathPart = '', queryPart = ''] = raw.split('?');
  const segs = pathPart.split('/').filter(Boolean);
  const query = new URLSearchParams(queryPart);
  const head = segs[0] ?? '';
  const map: Record<string, Route['name']> = {
    unlock: 'unlock',
    vault: 'vault',
    file: 'file',
    shares: 'shares',
    recovery: 'recovery',
    settings: 'settings',
    share: 'share',
  };
  return { name: map[head] ?? 'unknown', params: segs.slice(1), query };
}

export function navigate(route: string): void {
  const next = route.startsWith('#') ? route : `#${route.startsWith('/') ? '' : '/'}${route}`;
  if (window.location.hash === next) {
    void render();
    return;
  }
  window.location.hash = next;
}

export function rerender(): void {
  void render();
}

export function lock(): void {
  service?.lock();
  window.clearTimeout(lockTimer);
  currentCleanup?.();
  currentCleanup = null;
  navigate('#/unlock');
  toast('Brankas terkunci', 'info', 2200);
}

function armAutoLock(): void {
  window.clearTimeout(lockTimer);
  if (!service?.isUnlocked) return;
  const secs = service.config?.settings.autoLockSeconds ?? 0;
  if (secs <= 0) return;
  lockTimer = window.setTimeout(() => lock(), secs * 1000);
}

function makeContext(adapter: StorageAdapter): AppContext {
  return {
    service,
    adapter,
    get settings() {
      return settings;
    },
    storageLabel: adapter.label,
    navigate,
    rerender,
    lock,
    updateSettings: (patch) => {
      settings = { ...settings, ...patch };
      saveSettings(settings);
      armAutoLock();
    },
    setTitle: (title) => {
      document.title = `${title} · PodVault`;
      const slot = document.querySelector<HTMLElement>('[data-page-title]');
      if (slot) slot.textContent = title;
    },
    cleanup: (fn) => {
      currentCleanup?.();
      currentCleanup = fn;
    },
  };
}

async function render(): Promise<void> {
  const token = ++renderToken;
  currentCleanup?.();
  currentCleanup = null;

  const route = parseRoute();
  const app = document.getElementById('app');
  if (!app) return;

  // Public share links must work without touching the owner's session.
  if (route.name === 'share') {
    const [id = '', key = ''] = route.params;
    app.replaceChildren(await publicShareView(makeContext(service.adapter), id, key, route.query.get('pod') ?? ''));
    return;
  }

  if (route.name === 'unknown') {
    navigate(service.isUnlocked ? '#/vault' : '#/unlock');
    return;
  }

  if (route.name === 'unlock') {
    if (service.isUnlocked) {
      navigate('#/vault');
      return;
    }
    app.replaceChildren(await unlockView(makeContext(service.adapter)));
    return;
  }

  if (route.name === 'recovery' || route.name === 'settings') {
    const ctx = makeContext(service.adapter);
    const view = route.name === 'recovery' ? await recoveryView(ctx) : await settingsView(ctx);
    if (token !== renderToken) return;
    app.replaceChildren(view);
    ctx.setTitle(ROUTE_TITLES[route.name] ?? 'PodVault');
    return;
  }

  if (!service.isUnlocked) {
    navigate('#/unlock');
    return;
  }

  const shell = renderShell(route.name === 'shares' ? 'share' : 'vault');
  const ctx = makeContext(service.adapter);
  shell.setStatus(`Terbuka · ${ctx.storageLabel}`, 'ok');
  shell.root.querySelector<HTMLButtonElement>('#lock-btn')?.addEventListener('click', () => lock());
  app.replaceChildren(shell.root);

  let view: HTMLElement;
  switch (route.name) {
    case 'file':
      view = await fileView(ctx, route.params[0] ?? '');
      break;
    case 'shares':
      view = await sharesView(ctx);
      break;
    default:
      view = await vaultView(ctx);
  }
  if (token !== renderToken) return;
  shell.outlet.replaceChildren(view);
  ctx.setTitle(ROUTE_TITLES[route.name] ?? 'PodVault');
  armAutoLock();
}
