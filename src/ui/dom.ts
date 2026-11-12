/**
 * UI DOM helpers conforming to docs/CONTRACT.md
 */
import {
  h as el,
  toast,
  modal,
  formatBytes,
  formatDate,
  type Child,
} from './views/helpers.js';

export { el, toast, modal, formatBytes, formatDate };

export function qs<T extends Element = HTMLElement>(selector: string, parent: ParentNode = document): T | null {
  return parent.querySelector<T>(selector);
}

export function mount(parent: Element, ...children: Child[]): void {
  parent.replaceChildren();
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) {
      for (const c of child) {
        if (c !== null && c !== undefined && c !== false) {
          parent.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
        }
      }
      continue;
    }
    parent.appendChild(typeof child === 'string' || typeof child === 'number' ? document.createTextNode(String(child)) : child);
  }
}

export function icon(name: string): HTMLElement {
  const glyphMap: Record<string, string> = {
    vault: '▤',
    share: '↗',
    recovery: '◈',
    settings: '⚙',
    seal: '◈',
    empty: '◇',
    lock: '🔒',
    unlock: '🔓',
    check: '✓',
    cross: '✕',
    warning: '⚠',
    file: '📄',
    search: '🔍',
  };
  const span = document.createElement('span');
  span.className = `icon icon-${name}`;
  span.setAttribute('aria-hidden', 'true');
  span.textContent = glyphMap[name] ?? name;
  return span;
}
