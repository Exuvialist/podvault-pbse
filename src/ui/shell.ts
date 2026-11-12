export type ShellPage = 'vault' | 'share' | 'recovery' | 'settings';

const NAV: Array<{ id: ShellPage; href: string; label: string; glyph: string }> = [
  { id: 'vault', href: '#/vault', label: 'Brankas', glyph: '▤' },
  { id: 'share', href: '#/shares', label: 'Berbagi', glyph: '↗' },
  { id: 'recovery', href: '#/recovery', label: 'Pemulihan', glyph: '◈' },
  { id: 'settings', href: '#/settings', label: 'Pengaturan', glyph: '⚙' },
];

export interface Shell {
  root: HTMLElement;
  outlet: HTMLElement;
  topbar: HTMLElement;
  setStatus(text: string, kind?: 'ok' | 'warn' | 'err' | 'neutral'): void;
}

export function renderShell(active: ShellPage): Shell {
  const nav = document.createElement('nav');
  nav.className = 'nav';
  nav.setAttribute('aria-label', 'Navigasi utama');
  for (const item of NAV) {
    const a = document.createElement('a');
    a.className = `nav-item${item.id === active ? ' is-active' : ''}`;
    a.href = item.href;
    a.textContent = item.label;
    if (item.id === active) a.setAttribute('aria-current', 'page');
    const glyph = document.createElement('span');
    glyph.className = 'nav-glyph';
    glyph.setAttribute('aria-hidden', 'true');
    glyph.textContent = item.glyph;
    a.prepend(glyph);
    nav.append(a);
  }

  const brand = document.createElement('a');
  brand.className = 'brand';
  brand.href = '#/vault';
  brand.innerHTML = '<span class="seal" aria-hidden="true">◈</span>';
  const word = document.createElement('span');
  word.className = 'wordmark';
  word.textContent = 'PodVault';
  brand.append(word);

  const sideFoot = document.createElement('div');
  sideFoot.className = 'side-foot';
  sideFoot.innerHTML = '<span class="dot dot-ok" aria-hidden="true"></span><span>Kunci di perangkat ini</span>';

  const sidebar = document.createElement('aside');
  sidebar.className = 'sidebar';
  sidebar.append(brand, nav, sideFoot);

  const status = document.createElement('span');
  status.className = 'pill pill-ok';
  status.id = 'status-pill';
  status.textContent = 'Terbuka';

  const lockBtn = document.createElement('button');
  lockBtn.type = 'button';
  lockBtn.className = 'btn btn-ghost btn-sm';
  lockBtn.id = 'lock-btn';
  lockBtn.textContent = 'Kunci';
  lockBtn.setAttribute('aria-label', 'Kunci brankas');

  const title = document.createElement('span');
  title.className = 'topbar-title';
  title.dataset['pageTitle'] = '';

  const actions = document.createElement('div');
  actions.className = 'topbar-actions';
  actions.append(status, lockBtn);

  const topbar = document.createElement('header');
  topbar.className = 'topbar';
  topbar.append(title, actions);

  const outlet = document.createElement('main');
  outlet.className = 'outlet';
  outlet.id = 'outlet';

  const main = document.createElement('div');
  main.className = 'main';
  main.append(topbar, outlet);

  const root = document.createElement('div');
  root.className = 'app-shell';
  root.append(sidebar, main);

  return {
    root,
    outlet,
    topbar,
    setStatus(text, kind = 'neutral') {
      status.textContent = text;
      status.className = `pill pill-${kind}`;
    },
  };
}
