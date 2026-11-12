import type { AppContext } from '../../app.js';
import { CATEGORIES } from '../../core/types.js';
import { SecurePdfViewer } from '../../features/viewer.js';
import { getClientIp } from '../../features/net.js';
import { openShareModal } from './share-modal.js';
import {
  badge,
  btn,
  confirmDialog,
  copyText,
  downloadJson,
  emptyState,
  formatBytes,
  formatDate,
  h,
  input,
  modal,
  shortHash,
  toast,
} from './helpers.js';

export async function fileView(ctx: AppContext, id: string): Promise<HTMLElement> {
  const record = await ctx.service.getFile(id);
  if (!record) {
    return h(
      'div',
      { class: 'view' },
      emptyState('Dokumen tidak ditemukan', 'Mungkin sudah dihapus atau tautannya salah.', btn('Kembali ke brankas', 'primary', () => ctx.navigate('#/vault'))),
    );
  }

  const viewerHost = h('div', { class: 'viewer-host', hidden: true });
  const isPdf = record.mime === 'application/pdf' || record.name.toLowerCase().endsWith('.pdf');
  let viewer: SecurePdfViewer | null = null;

  const closeViewer = (): void => {
    viewer?.destroy();
    viewer = null;
    viewerHost.hidden = true;
    viewerHost.replaceChildren();
  };

  const openViewer = async (): Promise<void> => {
    if (!isPdf) {
      toast('Pratinjau aman saat ini hanya untuk PDF. Format lain tetap terenkripsi di brankas.', 'info', 6000);
      return;
    }
    try {
      const { bytes } = await ctx.service.readFile(record.id);
      const ip = await getClientIp(ctx.settings.watermarkIp);
      viewerHost.hidden = false;
      viewer = new SecurePdfViewer(viewerHost, bytes, {
        watermark: { webId: ctx.service.webId, ip, at: new Date().toISOString().replace('T', ' ').replace('Z', ' UTC') },
        onState: (state) => {
          if (state.error) toast(`Gagal merender: ${state.error}`, 'err');
        },
      });
      ctx.cleanup(closeViewer);
      await viewer.mount();
      viewerHost.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      toast(`Dokumen tidak dapat dibuka: ${(err as Error).message}`, 'err', 6000);
    }
  };

  const rename = (): void => {
    const name = input({ type: 'text', value: record.name });
    modal({
      title: 'Ganti nama dokumen',
      body: h('div', {}, h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Nama'), name)),
      actions: [
        { label: 'Batal' },
        {
          label: 'Simpan',
          variant: 'primary',
          onClick: async () => {
            const next = name.value.trim();
            if (!next) {
              toast('Nama tidak boleh kosong', 'err');
              return;
            }
            await ctx.service.updateFile(record.id, { name: next });
            toast('Nama diperbarui', 'ok');
            ctx.rerender();
          },
        },
      ],
    });
  };

  const remove = async (): Promise<void> => {
    if (!(await confirmDialog('Hapus dokumen?', `“${record.name}” akan dihapus permanen dari penyimpanan ini.`))) return;
    await ctx.service.deleteFile(record.id);
    toast('Dokumen dihapus', 'ok');
    ctx.navigate('#/vault');
  };

  const categoryLabel = CATEGORIES.find((c) => c.id === record.category)?.label ?? record.category;

  return h(
    'div',
    { class: 'view' },
    h(
      'header',
      { class: 'view-head' },
      h(
        'div',
        {},
        h('a', { href: '#/vault', class: 'link small' }, '← Brankas'),
        h('h1', { class: 'page-title' }, record.name),
        h('div', { class: 'row gap-1' }, badge(categoryLabel, 'accent'), badge('AES-GCM-256', 'ok'), ...record.tags.map((t) => badge(`#${t}`))),
      ),
      h(
        'div',
        { class: 'row gap-2' },
        btn('Buka dokumen', 'primary', openViewer, { disabled: !isPdf }),
        btn('Bagikan', 'ghost', () => openShareModal(ctx, record)),
        btn('Ganti nama', 'ghost', rename),
        btn('Hapus', 'danger', remove),
      ),
    ),
    viewerHost,
    h(
      'div',
      { class: 'detail-grid' },
      detailCard('Metadata', [
        ['Ukuran', formatBytes(record.size)],
        ['Kategori', categoryLabel],
        ['Dibuat', formatDate(record.createdAt)],
        ['Diperbarui', formatDate(record.updatedAt)],
      ]),
      detailCard('Integritas', [
        ['SHA-256', shortHash(record.sha256, 16)],
        ['ID', shortHash(record.id, 8)],
        ['Enkripsi isi', 'AES-GCM-256'],
        ['Kunci', 'dibungkus MK (per-file key)'],
      ]),
    ),
    h(
      'div',
      { class: 'notice' },
      'Mode hanya-lihat: dokumen dirender ke kanvas, tanpa URL berkas, tanpa unduh. Watermark memuat WebID, IP, dan waktu UTC pengakses.',
    ),
    h(
      'div',
      { class: 'row gap-2' },
      btn('Salin SHA-256', 'ghost', () => copyText(record.sha256)),
      btn('Unduh Ciphertext (.json)', 'ghost', () => {
        downloadJson(`${record.name}.encrypted.json`, record);
        toast('Ciphertext berkas berhasil diunduh', 'ok');
      }),
    ),
  );
}

function detailCard(title: string, rows: Array<[string, string]>): HTMLElement {
  return h(
    'section',
    { class: 'card detail-card' },
    h('h2', { class: 'card-title' }, title),
    h(
      'dl',
      { class: 'kv' },
      ...rows.flatMap(([k, v]) => [h('dt', {}, k), h('dd', { class: 'mono' }, v)]),
    ),
  );
}
