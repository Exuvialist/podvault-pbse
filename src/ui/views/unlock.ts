import type { AppContext } from '../../app.js';
import { btn, field, h, input, toast } from './helpers.js';

const MIN_PASSPHRASE = 12;

export async function unlockView(ctx: AppContext): Promise<HTMLElement> {
  const exists = await ctx.service.exists();
  return exists ? unlockExisting(ctx) : createNew(ctx);
}

function authShell(inner: HTMLElement, footer?: HTMLElement): HTMLElement {
  return h(
    'div',
    { class: 'auth-wrap' },
    h(
      'div',
      { class: 'auth-card card' },
      h(
        'div',
        { class: 'auth-brand' },
        h('span', { class: 'seal', 'aria-hidden': 'true' }, '◈'),
        h('div', {}, h('h1', { class: 'wordmark' }, 'PodVault'), h('p', { class: 'muted auth-tag' }, 'Brankas dokumen kedaulatan mandiri')),
      ),
      inner,
      footer ?? null,
    ),
    h('p', { class: 'auth-legal muted' }, 'Kunci tidak pernah meninggalkan perangkat ini. Tidak ada server yang dapat membaca dokumen Anda.'),
  );
}

function storageFooter(ctx: AppContext): HTMLElement {
  return h(
    'div',
    { class: 'auth-footer' },
    h('span', { class: 'muted' }, `Penyimpanan: ${ctx.storageLabel}`),
    h(
      'a',
      { href: '#/settings', class: 'link' },
      'Ubah',
    ),
  );
}

function createNew(ctx: AppContext): HTMLElement {
  const webId = input({
    type: 'url',
    placeholder: 'https://demo.pod/profile#me',
    value: ctx.settings.webId || '',
    autocomplete: 'off',
    spellcheck: false,
  });
  const pass = input({ type: 'password', placeholder: 'Minimal 12 karakter', autocomplete: 'new-password' });
  const confirm = input({ type: 'password', placeholder: 'Ulangi passphrase', autocomplete: 'new-password' });
  const hint = h('p', { class: 'field-hint' }, 'Passphrase menurunkan kunci enkripsi (PBKDF2 600.000 iterasi). Tidak ada reset — gunakan Recovery Sheet.');

  const form = h(
    'form',
    { class: 'auth-form' },
    field('WebID', webId, 'Identitas Solid Anda. Boleh berupa URL apa pun untuk demo lokal.'),
    field('Passphrase', pass),
    field('Konfirmasi passphrase', confirm),
    hint,
    btn('Buat brankas', 'primary', undefined, { type: 'submit' }),
  );

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const p = pass.value;
    if (p.length < MIN_PASSPHRASE) return toast(`Passphrase minimal ${MIN_PASSPHRASE} karakter`, 'err');
    if (p !== confirm.value) return toast('Konfirmasi passphrase tidak cocok', 'err');
    const id = webId.value.trim();
    if (!id) return toast('WebID wajib diisi', 'err');
    const submit = form.querySelector('button');
    if (submit) submit.disabled = true;
    try {
      await ctx.service.create(p, id);
      ctx.updateSettings({ webId: id });
      toast('Brankas dibuat. Simpan Recovery Sheet segera.', 'ok', 6000);
      ctx.navigate('#/vault');
    } catch (err) {
      if ((err as Error).message === 'vault-sudah-ada') {
        toast('Brankas sudah ada di penyimpanan ini', 'err');
        ctx.rerender();
      } else {
        toast(`Gagal membuat brankas: ${(err as Error).message}`, 'err', 6000);
      }
      if (submit) submit.disabled = false;
    }
  });

  return authShell(
    h(
      'div',
      {},
      h('h2', { class: 'auth-title' }, 'Buat brankas baru'),
      h('p', { class: 'muted' }, 'Dokumen dienkripsi di peramban sebelum menyentuh penyimpanan.'),
      form,
    ),
    storageFooter(ctx),
  );
}

function unlockExisting(ctx: AppContext): HTMLElement {
  const pass = input({ type: 'password', placeholder: 'Passphrase brankas', autocomplete: 'current-password' });
  const form = h('form', { class: 'auth-form' }, field('Passphrase', pass), btn('Buka brankas', 'primary', undefined, { type: 'submit' }));

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const submit = form.querySelector('button');
    if (submit) submit.disabled = true;
    try {
      await ctx.service.unlock(pass.value);
      pass.value = '';
      ctx.navigate('#/vault');
    } catch (err) {
      const msg = (err as Error).message === 'passphrase-salah' ? 'Passphrase salah.' : `Gagal membuka: ${(err as Error).message}`;
      toast(msg, 'err');
      pass.select();
      if (submit) submit.disabled = false;
    }
  });

  const recovery = h(
    'div',
    { class: 'auth-alt' },
    h('a', { class: 'link', href: '#/recovery' }, 'Pulihkan dengan Recovery Sheet'),
    btn('Passkey (Fase 2)', 'ghost', undefined, { disabled: true, title: 'WebAuthn PRF dijadwalkan pada Fase 2' }),
  );

  return authShell(
    h('div', {}, h('h2', { class: 'auth-title' }, 'Buka brankas'), h('p', { class: 'muted' }, 'Masukkan passphrase untuk menurunkan kunci di perangkat ini.'), form, recovery),
    storageFooter(ctx),
  );
}
