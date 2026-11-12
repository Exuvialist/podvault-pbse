import type { AppContext } from '../../app.js';
import type { ShareRecord } from '../../core/types.js';
import type { StorageAdapter } from '../../storage/adapter.js';
import { SolidAdapter } from '../../storage/solid.js';
import { isExpired } from '../../core/expiry.js';
import { openShare, readShare, ShareError } from '../../features/share.js';
import { SecurePdfViewer } from '../../features/viewer.js';
import { badge, btn, emptyState, field, formatDate, h, input, toast } from './helpers.js';

export async function publicShareView(ctx: AppContext, id: string, key: string, pod: string): Promise<HTMLElement> {
  const adapter: StorageAdapter = pod ? new SolidAdapter({ baseUrl: pod, webId: '' }) : ctx.adapter;

  const shell = (inner: HTMLElement): HTMLElement =>
    h(
      'div',
      { class: 'standalone share-page' },
      h(
        'header',
        { class: 'standalone-head' },
        h('div', { class: 'row gap-1' }, h('span', { class: 'seal small', 'aria-hidden': 'true' }, '◈'), h('strong', { class: 'wordmark small' }, 'PodVault')),
        h('span', { class: 'muted small' }, 'Tautan berbagi'),
      ),
      inner,
      h('p', { class: 'auth-legal muted' }, 'Dokumen didekripsi di peramban Anda. Tautan ini tidak menyediakan unduhan berkas.'),
    );

  if (!id) return shell(emptyState('Tautan tidak lengkap', 'ID berbagi tidak ditemukan pada URL.'));

  let record: ShareRecord | null;
  try {
    record = await readShare(adapter, id);
  } catch (err) {
    return shell(emptyState('Pod tidak dapat dihubungi', `Tidak dapat membaca tautan: ${(err as Error).message}`));
  }

  if (!record) return shell(emptyState('Tautan tidak ditemukan', 'Tautan mungkin sudah dicabut atau dihapus oleh pemiliknya.'));
  if (record.revoked) return shell(emptyState('Tautan dicabut', 'Pemilik dokumen telah mencabut akses ini.'));
  if (isExpired(record)) return shell(emptyState('Tautan kedaluwarsa', `Masa berlaku berakhir ${formatDate(record.expiresAt)}.`));

  const viewerHost = h('div', { class: 'viewer-host', hidden: true });
  const bodyHost = h('div', { class: 'share-body' });

  let viewer: SecurePdfViewer | null = null;
  const mount = async (passphrase?: string): Promise<void> => {
    try {
      const { bytes } = await openShare(adapter, id, key, passphrase);
      viewer?.destroy();
      bodyHost.replaceChildren(viewerHost);
      viewerHost.hidden = false;
      viewer = new SecurePdfViewer(viewerHost, bytes, {
        watermark: {
          webId: `penerima-eksternal@${id.slice(0, 8)}`,
          ip: 'ip-lokal',
          at: new Date().toISOString().replace('T', ' ').replace('Z', ' UTC'),
        },
        onState: (s) => {
          if (s.error) toast(`Gagal merender: ${s.error}`, 'err');
        },
      });
      const active = viewer;
      ctx.cleanup(() => active.destroy());
      await viewer.mount();
    } catch (err) {
      if (err instanceof ShareError) {
        const map: Record<ShareError['code'], string> = {
          'tidak-ada': 'Tautan tidak ditemukan.',
          kedaluwarsa: 'Tautan sudah kedaluwarsa.',
          dicabut: 'Tautan telah dicabut.',
          'butuh-passphrase': 'Passphrase diperlukan.',
          'kunci-tidak-ada': 'Kunci pada tautan tidak lengkap.',
          integrity: 'Dokumen gagal diverifikasi (integritas).',
        };
        toast(map[err.code], 'err', 6000);
      } else {
        toast(`Gagal membuka: ${(err as Error).message}`, 'err', 6000);
      }
    }
  };

  if (record.wrappedKey && record.kdf) {
    const pass = input({ type: 'password', placeholder: 'Passphrase dari pengirim', autocomplete: 'off' });
    const form = h('form', { class: 'auth-form' }, field('Passphrase', pass), btn('Buka dokumen', 'primary', undefined, { type: 'submit' }));
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (!pass.value) {
        toast('Masukkan passphrase', 'err');
        return;
      }
      await mount(pass.value);
    });
    bodyHost.append(
      h('section', { class: 'card' }, h('h2', {}, 'Dokumen terlindungi'), h('p', { class: 'muted' }, 'Pengirim mewajibkan passphrase. Kunci tidak ada di URL.'), form),
    );
  } else {
    void mount();
  }

  return shell(
    h(
      'div',
      {},
      h(
        'header',
        { class: 'view-head' },
        h('div', {}, h('h1', { class: 'page-title' }, record.fileName), h('div', { class: 'row gap-1' }, badge('Hanya lihat', 'accent'), badge(`Kedaluwarsa ${formatDate(record.expiresAt)}`, 'warn'))),
      ),
      bodyHost,
      h('p', { class: 'notice' }, 'Watermark memuat identitas penerima, alamat IP, dan waktu akses. Penyalahgunaan dapat dilacak.'),
    ),
  );
}
