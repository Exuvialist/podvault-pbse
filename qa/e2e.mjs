#!/usr/bin/env node
/**
 * End-to-end QA on the real surface: Chrome via playwright-core (no bundled browser).
 * Requires `npm run preview` (port 4173) or BASE_URL pointing at a served build.
 */
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:4173/';
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = 'qa';
const PASS = 'passphrase-demo-2026';
const NEW_PASS = 'passphrase-baru-2026';
const SHARE_PASS = 'penerima-2026';

mkdirSync(OUT, { recursive: true });

const checks = [];
const consoleErrors = [];

function check(name, ok, detail = '') {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function shot(page, name, fullPage = false) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage });
  console.log(`      screenshot ${OUT}/${name}.png`);
}

async function hash(page, value) {
  await page.evaluate((v) => {
    window.location.hash = v;
  }, value);
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
const page = await context.newPage();

page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(`console: ${msg.text()}`);
});

try {
  // ---------------------------------------------------------------- 1. create
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.auth-card');
  await shot(page, '01-unlock-create');

  check('auth screen renders', (await page.locator('.auth-title').innerText()).includes('Buat brankas'));

  await page.locator('.auth-form input[type=url]').fill('https://demo.pod/profile/card#me');
  const passes = page.locator('.auth-form input[type=password]');
  await passes.nth(0).fill(PASS);
  await passes.nth(1).fill(PASS);
  await page.getByRole('button', { name: 'Buat brankas' }).click();

  await page.waitForSelector('.view .page-title', { timeout: 15000 });
  check('vault created and opened', (await page.locator('.page-title').innerText()) === 'Brankas');
  await shot(page, '02-vault-empty');

  // ---------------------------------------------------------------- 2. upload
  await page.getByRole('button', { name: 'Unggah dokumen' }).first().click();
  await page.waitForSelector('.modal');
  await page.locator('.modal input[type=file]').setInputFiles('samples/sertifikat-tanah.pdf');
  await page.locator('.modal select').selectOption('aset');
  await page.locator('.modal input[type=text]').fill('tanah, demo');
  await page.getByRole('button', { name: 'Unggah', exact: true }).click();

  await page.waitForSelector('.file-card', { timeout: 15000 });
  check('document uploaded and listed', (await page.locator('.file-card').count()) === 1);
  check('category chip shows aset', (await page.locator('.file-card .badge').first().innerText()) === 'Kepemilikan Aset');
  await shot(page, '03-vault-with-file');

  // duplicate guard
  await page.getByRole('button', { name: 'Unggah dokumen' }).first().click();
  await page.locator('.modal input[type=file]').setInputFiles('samples/sertifikat-tanah.pdf');
  await page.getByRole('button', { name: 'Unggah', exact: true }).click();
  await page.waitForTimeout(700);
  const toastText = await page.locator('.toast').last().innerText();
  check('duplicate upload blocked', toastText.includes('identik'), toastText);
  await page.keyboard.press('Escape');

  // ------------------------------------------------------- 3. zero-knowledge
  const leak = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('podvault');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const values = await new Promise((resolve, reject) => {
      const req = db.transaction('kv').objectStore('kv').getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    const blob = values.join('\n');
    return {
      hasPlaintext: blob.includes('SERTIFIKAT TANAH'),
      hasPassphrase: blob.includes('passphrase-demo-2026'),
      hasCipher: blob.includes('"cipher"'),
      bytes: blob.length,
    };
  });
  check('no plaintext in IndexedDB', leak.hasPlaintext === false);
  check('no passphrase in IndexedDB', leak.hasPassphrase === false);
  check('ciphertext records present', leak.hasCipher === true, `${leak.bytes} bytes stored`);

  // ---------------------------------------------------------------- 4. viewer
  await page.locator('.file-card').first().click();
  await page.waitForSelector('.detail-grid');
  await page.getByRole('button', { name: 'Buka dokumen' }).click();
  await page.waitForFunction(() => {
    const c = document.querySelector('.viewer-canvas');
    return c instanceof HTMLCanvasElement && c.width > 100;
  }, null, { timeout: 20000 });
  await page.waitForTimeout(400);
  check('PDF rendered to canvas', true);
  check('viewer uses canvas, no object URL', (await page.locator('.viewer-canvas').count()) === 1);
  await shot(page, '04-viewer-watermark');

  const wm = await page.locator('.watermark-cell').first().innerText();
  check('watermark carries WebID', wm.includes('demo.pod'), wm);
  check('watermark carries UTC timestamp', wm.includes('UTC'));

  const guards = await page.evaluate(() => {
    const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    document.body.dispatchEvent(menu);
    const print = new KeyboardEvent('keydown', { key: 'p', ctrlKey: true, bubbles: true, cancelable: true });
    document.dispatchEvent(print);
    return { menu: menu.defaultPrevented, print: print.defaultPrevented };
  });
  check('right-click blocked', guards.menu === true);
  check('Ctrl+P blocked', guards.print === true);

  // ----------------------------------------------------------------- 5. share
  await page.getByRole('button', { name: 'Bagikan' }).first().click();
  await page.waitForSelector('.share-form');
  await page.locator('#use-pass').check();
  await page.locator('.modal input[type=password]').fill(SHARE_PASS);
  await page.locator('.modal select').selectOption('1');
  await page.getByRole('button', { name: 'Buat tautan' }).click();
  await page.waitForSelector('.copy-row input');
  const shareUrl = await page.locator('.copy-row input').inputValue();
  check('share link created without key in URL', shareUrl.includes('#/share/') && !shareUrl.includes('?k='), shareUrl);
  await shot(page, '05-share-modal');
  await page.keyboard.press('Escape');

  // ------------------------------------------------------------- 6. recipient
  const recipient = await context.newPage();
  recipient.on('pageerror', (err) => consoleErrors.push(`recipient pageerror: ${err.message}`));
  await recipient.goto(shareUrl, { waitUntil: 'networkidle' });
  await recipient.waitForSelector('.share-page');
  check('recipient sees passphrase gate', (await recipient.locator('input[type=password]').count()) === 1);
  await recipient.locator('input[type=password]').fill(SHARE_PASS);
  await recipient.getByRole('button', { name: 'Buka dokumen' }).click();
  await recipient.waitForFunction(() => {
    const c = document.querySelector('.viewer-canvas');
    return c instanceof HTMLCanvasElement && c.width > 100;
  }, null, { timeout: 20000 });
  await recipient.waitForTimeout(300);
  const rwm = await recipient.locator('.watermark-cell').first().innerText();
  check('recipient watermark marks external recipient', rwm.includes('penerima-eksternal'), rwm);
  await shot(recipient, '06-recipient-view');

  const wrong = await recipient.evaluate(() => window.location.hash);
  check('recipient route is a share route', wrong.includes('#/share/'), wrong);

  // --------------------------------------------------------------- 7. recovery
  await hash(page, '#/recovery');
  await page.waitForSelector('.recovery-grid');
  await page.getByRole('button', { name: 'Buat & cetak' }).click();
  await page.waitForSelector('.sheet');
  await page.waitForTimeout(350);
  const codes = await page.locator('.sheet-code').allInnerTexts();
  check('recovery sheet generated with 5 shares', codes.length === 5);
  check('shares are prefixed', codes.every((c) => c.startsWith('podvault:share:v1:')));
  await shot(page, '07-recovery-sheet');

  const sheetHasQr = await page.locator('.sheet-qr').count();
  check('QR codes rendered on sheet', sheetHasQr === 5);
  await page.getByRole('button', { name: 'Tutup' }).click();

  // --------------------------------------------------------- 8. lock + restore
  await hash(page, '#/vault');
  await page.waitForSelector('#lock-btn');
  await page.click('#lock-btn');
  await page.waitForSelector('.auth-card');
  check('vault locks and returns to auth', (await page.locator('.auth-title').innerText()).includes('Buka brankas'));

  await page.locator('.auth-form input[type=password]').fill('passphrase-salah-sekali');
  await page.getByRole('button', { name: 'Buka brankas' }).click();
  await page.waitForTimeout(600);
  const wrongToast = await page.locator('.toast').last().innerText();
  check('wrong passphrase rejected', wrongToast.toLowerCase().includes('salah'), wrongToast);

  await hash(page, '#/recovery');
  await page.waitForSelector('.recovery-grid');
  await page.locator('.textarea').fill(codes.slice(0, 3).join('\n'));
  const newPassInputs = page.locator('.recovery-grid input[type=password]');
  await newPassInputs.fill(NEW_PASS);
  await page.getByRole('button', { name: 'Pulihkan' }).click();

  await page.waitForSelector('.file-card', { timeout: 20000 });
  check('recovery sheet restores vault access', (await page.locator('.file-card').count()) === 1);
  await shot(page, '08-vault-restored');

  // ------------------------------------------------------------ 9. audit/settings
  await hash(page, '#/settings');
  await page.waitForSelector('.settings-grid');
  await page.getByRole('button', { name: 'Verifikasi rantai' }).click();
  await page.waitForTimeout(500);
  const auditToast = await page.locator('.toast').last().innerText();
  check('audit chain verifies after restore', auditToast.includes('valid'), auditToast);
  await shot(page, '09-settings', true);

  // ------------------------------------------------------------- 10. responsive
  await page.setViewportSize({ width: 390, height: 844 });
  await hash(page, '#/vault');
  await page.waitForTimeout(400);
  await shot(page, '10-mobile-vault');
  const navVisible = await page.locator('.sidebar .nav-item').first().isVisible();
  check('mobile bottom navigation visible', navVisible);

  await page.setViewportSize({ width: 1440, height: 960 });
} catch (err) {
  check('e2e run completed without exception', false, err.message);
  try {
    await shot(page, '99-failure');
  } catch {
    /* ignore */
  }
} finally {
  check('no uncaught console/page errors', consoleErrors.length === 0, consoleErrors.slice(0, 4).join(' | '));
  const failed = checks.filter((c) => !c.ok);
  writeFileSync(`${OUT}/report.json`, JSON.stringify({ checks, consoleErrors, at: new Date().toISOString() }, null, 2));
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
  await browser.close();
  process.exit(failed.length === 0 ? 0 : 1);
}
