/**
 * Emergency Recovery Kit: Shamir-split the master key into n paper shares (k to restore).
 * The sheet is meant to be printed and stored offline, in separate physical locations.
 */
import QRCode from 'qrcode';
import { combineShares, splitSecret, type Share } from '../core/shamir.js';
import { fingerprint } from '../core/keys.js';
import type { VaultSession } from './vault.js';

export const SHARE_PREFIX = 'podvault:share:v1';

export interface RecoveryKit {
  shares: Share[];
  threshold: number;
  total: number;
  fingerprint: string;
  createdAt: string;
  webId: string;
}

export interface SheetOptions {
  kit: RecoveryKit;
  /** Renders the QR codes; injectable so tests do not need a canvas. */
  qr?: (text: string) => Promise<string>;
}

export async function createRecoveryKit(session: VaultSession, threshold: number, total: number): Promise<RecoveryKit> {
  const shares = splitSecret(session.masterKeyRaw, threshold, total);
  // Reconstruct from the minimum subset so the printed fingerprint matches what a restore yields.
  const rebuilt = combineShares(shares.slice(0, threshold));
  return {
    shares,
    threshold,
    total,
    fingerprint: await fingerprint(rebuilt),
    createdAt: new Date().toISOString(),
    webId: session.config.webId,
  };
}

export function encodeShare(share: Share): string {
  return `${SHARE_PREFIX}:${share.x}:${share.y}`;
}

export function parseShare(text: string): Share {
  const clean = text.trim().replace(/\s+/g, '');
  const match = /^podvault:share:v1:(\d{1,3}):([A-Za-z0-9_-]+)$/.exec(clean);
  if (!match) throw new Error('format-share-tidak-valid');
  const x = Number(match[1]);
  if (!Number.isInteger(x) || x < 1 || x > 255) throw new Error('format-share-tidak-valid');
  return { x, y: match[2] as string };
}

export function parseShares(text: string): Share[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseShare);
}

export async function recoverMasterKeyRaw(shares: Share[]): Promise<Uint8Array> {
  if (shares.length < 2) throw new Error('butuh-minimal-2-share');
  return combineShares(shares);
}

export async function renderRecoverySheet(opts: SheetOptions): Promise<HTMLElement> {
  const { kit } = opts;
  const qr = opts.qr ?? ((text: string) => QRCode.toDataURL(text, { margin: 1, width: 220, errorCorrectionLevel: 'M' }));

  const sheet = document.createElement('article');
  sheet.className = 'sheet';

  const head = document.createElement('header');
  head.className = 'sheet-head';
  const title = document.createElement('h1');
  title.textContent = 'PodVault — Emergency Recovery Sheet';
  const sub = document.createElement('p');
  sub.className = 'sheet-sub';
  sub.textContent = `WebID: ${kit.webId}`;
  const meta = document.createElement('p');
  meta.className = 'sheet-meta mono';
  meta.textContent = `Dibuat ${new Date(kit.createdAt).toISOString()} · ${kit.threshold}-dari-${kit.total} share diperlukan · Sidik jari kunci ${kit.fingerprint}`;
  head.append(title, sub, meta);

  const warn = document.createElement('p');
  warn.className = 'sheet-warn';
  warn.textContent =
    'Simpan setiap lembar di lokasi fisik berbeda. Jangan difoto, dipindai, atau disimpan di cloud. ' +
    'Siapa pun yang memiliki jumlah share sesuai ambang dapat membuka seluruh brankas tanpa passphrase.';

  const grid = document.createElement('div');
  grid.className = 'sheet-grid';

  for (const share of kit.shares) {
    const payload = encodeShare(share);
    const card = document.createElement('section');
    card.className = 'sheet-card';

    const label = document.createElement('h2');
    label.textContent = `Share ${share.x} / ${kit.total}`;

    const img = document.createElement('img');
    img.className = 'sheet-qr';
    img.alt = `QR share ${share.x}`;
    img.src = await qr(payload);

    const code = document.createElement('code');
    code.className = 'sheet-code';
    code.textContent = payload;

    const foot = document.createElement('p');
    foot.className = 'sheet-foot';
    foot.textContent = `PodVault · ${kit.fingerprint}`;

    card.append(label, img, code, foot);
    grid.append(card);
  }

  const instructions = document.createElement('ol');
  instructions.className = 'sheet-steps';
  for (const step of [
    'Cetak halaman ini pada kertas A4, satu sisi.',
    'Potong menjadi ' + kit.total + ' lembar dan simpan terpisah (mis. rumah, kantor, brankas bank).',
    'Untuk memulihkan: buka PodVault → Pemulihan → masukkan minimal ' + kit.threshold + ' kode share.',
    'Setelah pulih, segera buat passphrase baru; kunci master tetap sama.',
  ]) {
    const li = document.createElement('li');
    li.textContent = step;
    instructions.append(li);
  }

  const footer = document.createElement('footer');
  footer.className = 'sheet-footer';
  footer.textContent = 'Dokumen ini adalah kunci. Perlakukannya setara dengan uang tunai.';

  sheet.append(head, warn, grid, instructions, footer);
  return sheet;
}
