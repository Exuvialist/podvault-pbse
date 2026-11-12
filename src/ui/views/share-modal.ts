import type { AppContext } from '../../app.js';
import type { FileRecord } from '../../core/types.js';
import { createShare } from '../../features/share.js';
import { badge, btn, copyText, field, formatDate, h, input, modal, select, toast } from './helpers.js';

const HOUR_OPTIONS = [
  { value: '1', label: '1 jam' },
  { value: '6', label: '6 jam' },
  { value: '12', label: '12 jam' },
  { value: '24', label: '24 jam' },
];

export function openShareModal(ctx: AppContext, file: FileRecord): void {
  const hours = select(HOUR_OPTIONS, { value: '1' });
  const usePass = input({ type: 'checkbox', id: 'use-pass' });
  const pass = input({ type: 'password', placeholder: 'Passphrase untuk penerima', disabled: true, autocomplete: 'new-password' });
  usePass.addEventListener('change', () => {
    pass.disabled = !usePass.checked;
    if (!usePass.checked) pass.value = '';
  });

  const body = h(
    'div',
    { class: 'share-form' },
    h('p', { class: 'muted' }, 'Dokumen dienkripsi ulang dengan kunci sekali pakai. Pod hanya melihat ciphertext.'),
    field('Masa berlaku', hours),
    h('label', { class: 'check-row' }, usePass, h('span', {}, 'Wajibkan passphrase (kunci tidak masuk URL)')),
    field('Passphrase penerima', pass, 'Sampaikan lewat kanal berbeda dari tautannya.'),
    h('div', { class: 'notice' }, 'Tautan tidak dapat ditarik kembali setelah penerima menyalin ciphertext. Kedaluwarsa ditegakkan di klien.'),
  );

  const dialog = modal({
    title: `Bagikan “${file.name}”`,
    body,
    actions: [
      { label: 'Batal' },
      {
        label: 'Buat tautan',
        variant: 'primary',
        keepOpen: true,
        onClick: async () => {
          const session = ctx.service.unlocked;
          if (!session) {
            toast('Brankas terkunci', 'err');
            return;
          }
          const passphrase = usePass.checked ? pass.value : '';
          if (usePass.checked && passphrase.length < 8) {
            toast('Passphrase penerima minimal 8 karakter', 'err');
            return;
          }
          try {
            const { record, url } = await createShare(ctx.adapter, session, file, {
              hours: Number(hours.value),
              ...(passphrase ? { passphrase } : {}),
              ...(ctx.settings.podUrl.trim() ? { podUrl: ctx.settings.podUrl.trim() } : {}),
            });
            renderResult(dialog.root, url, record.expiresAt, Boolean(passphrase), passphrase);
          } catch (err) {
            toast(`Gagal membuat tautan: ${(err as Error).message}`, 'err', 6000);
          }
        },
      },
    ],
  });
}

function renderResult(panel: HTMLElement, url: string, expiresAt: string, hasPass: boolean, passphrase: string): void {
  const body = panel.querySelector('.modal-body');
  if (!body) return;
  const urlInput = input({ readonly: true, value: url, class: 'input mono' });
  urlInput.addEventListener('focus', () => urlInput.select());

  body.replaceChildren(
    h('div', { class: 'result-head' }, badge('Tautan aktif', 'ok'), h('span', { class: 'muted' }, `Kedaluwarsa ${formatDate(expiresAt)}`)),
    h('div', { class: 'copy-row' }, urlInput, btn('Salin', 'primary', () => copyText(url))),
    hasPass
      ? h('p', { class: 'notice warn' }, h('strong', {}, 'Passphrase: '), h('code', { class: 'mono' }, passphrase))
      : h('p', { class: 'notice' }, 'Kunci berada di bagian fragment URL — tidak pernah dikirim ke Pod.'),
    h('p', { class: 'muted small' }, 'Buka di tab baru untuk menguji alur penerima.'),
  );
}
