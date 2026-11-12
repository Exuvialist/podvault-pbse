/** Tiny DOM toolkit for the views. Text-only: never sets innerHTML from user data. */

export type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, unknown>;

export function applyAttrs(node: HTMLElement, attrs: Attrs): void {
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class' || key === 'className') {
      node.className = String(value);
      continue;
    }
    if (key === 'style' && typeof value === 'object') {
      Object.assign(node.style, value as Partial<CSSStyleDeclaration>);
      continue;
    }
    if (key === 'dataset' && typeof value === 'object') {
      Object.assign(node.dataset, value as Record<string, string>);
      continue;
    }
    if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
      continue;
    }
    if (key in node && !key.includes('-')) {
      (node as unknown as Record<string, unknown>)[key] = value;
      continue;
    }
    node.setAttribute(key, value === true ? '' : String(value));
  }
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  applyAttrs(node, attrs);
  append(node, children);
  return node;
}

export function append(parent: Node, children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) {
      append(parent, child as unknown as Child[]);
      continue;
    }
    parent.appendChild(typeof child === 'string' || typeof child === 'number' ? document.createTextNode(String(child)) : child);
  }
}

export function frag(...children: Child[]): DocumentFragment {
  const f = document.createDocumentFragment();
  append(f, children);
  return f;
}

export function clear(node: Element): void {
  node.replaceChildren();
}

export function btn(
  label: string,
  variant: 'primary' | 'ghost' | 'danger' | 'sm' = 'ghost',
  onClick?: (ev: MouseEvent) => void | Promise<unknown>,
  opts: { disabled?: boolean; title?: string; type?: 'button' | 'submit' } = {},
): HTMLButtonElement {
  const classes = variant === 'sm' ? 'btn btn-ghost btn-sm' : `btn btn-${variant}`;
  return h(
    'button',
    {
      class: classes,
      type: opts.type ?? 'button',
      disabled: opts.disabled ?? false,
      title: opts.title ?? label,
      'aria-label': opts.title ?? label,
      onclick: onClick
        ? async (ev: MouseEvent) => {
            ev.preventDefault();
            await onClick(ev);
          }
        : undefined,
    },
    label,
  );
}

export function field(label: string, input: HTMLElement, hint?: string): HTMLElement {
  return h(
    'label',
    { class: 'field' },
    h('span', { class: 'field-label' }, label),
    input,
    hint ? h('span', { class: 'field-hint' }, hint) : null,
  );
}

export function input(attrs: Record<string, unknown> = {}): HTMLInputElement {
  return h('input', { class: 'input', ...attrs });
}

export function textarea(attrs: Record<string, unknown> = {}): HTMLTextAreaElement {
  return h('textarea', { class: 'textarea', rows: 4, ...attrs });
}

export function select(options: Array<{ value: string; label: string }>, attrs: Record<string, unknown> = {}): HTMLSelectElement {
  const node = document.createElement('select');
  for (const opt of options) node.append(h('option', { value: opt.value }, opt.label));
  // Apply attrs after the options exist, otherwise setting `.value` is a no-op.
  applyAttrs(node, { class: 'select', ...attrs });
  return node;
}

export function badge(text: string, kind: 'neutral' | 'ok' | 'warn' | 'danger' | 'accent' = 'neutral'): HTMLElement {
  return h('span', { class: `badge badge-${kind}` }, text);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  if (!Number.isFinite(diff)) return iso;
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60000);
  if (mins < 1) return 'baru saja';
  if (mins < 60) return `${mins} menit lalu`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.round(hours / 24);
  return `${days} hari lalu`;
}

export function shortHash(hex: string, n = 12): string {
  return hex.length <= n * 2 ? hex : `${hex.slice(0, n)}…${hex.slice(-4)}`;
}

// ------------------------------------------------------------------ feedback

function toastHost(): HTMLElement {
  let host = document.getElementById('toasts');
  if (!host) {
    host = h('div', { id: 'toasts', class: 'toast-host', 'aria-live': 'polite' });
    document.body.append(host);
  }
  return host;
}

export function toast(message: string, kind: 'ok' | 'err' | 'info' = 'info', ms = 4200): void {
  const node = h('div', { class: `toast toast-${kind}`, role: 'status' }, message);
  toastHost().append(node);
  setTimeout(() => node.remove(), ms);
}

export interface ModalAction {
  label: string;
  variant?: 'primary' | 'ghost' | 'danger';
  onClick?: () => void | Promise<void>;
  keepOpen?: boolean;
}

export interface ModalOptions {
  title: string;
  body: Node;
  actions?: ModalAction[];
  onClose?: () => void;
  wide?: boolean;
}

export function modal(opts: ModalOptions): { close: () => void; root: HTMLElement } {
  const footer = h('footer', { class: 'modal-actions' });
  const panel = h('div', { class: `modal${opts.wide ? ' modal-wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title });
  const backdrop = h('div', { class: 'modal-backdrop' }, panel);

  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
    opts.onClose?.();
  };
  const onKey = (ev: KeyboardEvent): void => {
    if (ev.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKey);
  backdrop.addEventListener('click', (ev) => {
    if (ev.target === backdrop) close();
  });

  for (const action of opts.actions ?? []) {
    footer.append(
      btn(action.label, action.variant ?? 'ghost', async () => {
        await action.onClick?.();
        if (!action.keepOpen) close();
      }),
    );
  }

  panel.append(h('header', { class: 'modal-head' }, h('h2', {}, opts.title)), h('div', { class: 'modal-body' }, opts.body), footer);
  document.body.append(backdrop);

  const focusable = panel.querySelector<HTMLElement>('input, textarea, select, button');
  focusable?.focus();
  return { close, root: panel };
}

export function confirmDialog(title: string, message: string, confirmLabel = 'Ya, lanjutkan'): Promise<boolean> {
  return new Promise((resolve) => {
    let decided = false;
    const { close } = modal({
      title,
      body: h('p', { class: 'muted' }, message),
      actions: [
        { label: 'Batal' },
        {
          label: confirmLabel,
          variant: 'danger',
          onClick: () => {
            decided = true;
            resolve(true);
          },
        },
      ],
      onClose: () => {
        if (!decided) resolve(false);
        close();
      },
    });
  });
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    toast('Disalin ke papan klip', 'ok', 2000);
    return true;
  } catch {
    const ta = h('textarea', { class: 'sr-only' });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    toast(ok ? 'Disalin ke papan klip' : 'Gagal menyalin', ok ? 'ok' : 'err');
    return ok;
  }
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(filename: string, content: string, mime: string = 'text/plain'): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function emptyState(title: string, text: string, action?: HTMLElement): HTMLElement {
  return h('div', { class: 'empty-state' }, h('div', { class: 'empty-mark', 'aria-hidden': 'true' }, '◇'), h('h3', {}, title), h('p', { class: 'muted' }, text), action ?? null);
}

export function stat(label: string, value: string, hint?: string): HTMLElement {
  return h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, label), h('strong', { class: 'stat-value' }, value), hint ? h('span', { class: 'stat-hint muted' }, hint) : null);
}
