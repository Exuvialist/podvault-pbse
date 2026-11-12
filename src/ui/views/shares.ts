import type { AppContext } from '../../app.js';
import { isExpired } from '../../core/expiry.js';
import { pruneShares, revokeShare, shareLinkFor } from '../../features/share.js';
import { badge, btn, confirmDialog, copyText, emptyState, formatDate, h, toast } from './helpers.js';

export async function sharesView(ctx: AppContext): Promise<HTMLElement> {
  const shares = await ctx.service.listShares();

  const rows = await Promise.all(
    shares.map(async (share) => {
      const expired = isExpired(share);
      const status = share.revoked ? badge('Dicabut', 'danger') : expired ? badge('Kedaluwarsa', 'warn') : badge('Aktif', 'ok');
      const remaining = expired
        ? '—'
        : `${Math.max(0, Math.round((Date.parse(share.expiresAt) - Date.now()) / 60000))} menit lagi`;

      const copy = btn('Salin tautan', 'ghost', async () => {
        const session = ctx.service.unlocked;
        if (!session) return;
        const url = await shareLinkFor(session, share, ctx.settings.podUrl.trim());
        await copyText(url);
      });

      return h(
        'article',
        { class: 'share-row card' },
        h(
          'div',
          { class: 'share-main' },
          h('div', { class: 'row gap-1' }, h('h3', { class: 'file-name' }, share.fileName), status),
          h(
            'p',
            { class: 'muted small' },
            `Dibuat ${formatDate(share.createdAt)} · kedaluwarsa ${formatDate(share.expiresAt)} · ${remaining} · ${share.views}× dibuka`,
          ),
          h('p', { class: 'muted small mono' }, `id ${share.id.slice(0, 8)} · ${share.wrappedKey ? 'passphrase' : 'kunci di URL'}`),
        ),
        h(
          'div',
          { class: 'row gap-1' },
          expired || share.revoked ? null : copy,
          expired || share.revoked
            ? null
            : btn('Cabut', 'danger', async () => {
                if (!(await confirmDialog('Cabut tautan?', 'Penerima yang belum membuka tautan tidak akan bisa lagi. Salinan yang sudah diunduh tidak dapat ditarik.'))) return;
                await revokeShare(ctx.adapter, share.id);
                toast('Tautan dicabut', 'ok');
                ctx.rerender();
              }),
          btn('Buka dokumen', 'ghost', () => ctx.navigate(`#/file/${share.fileId}`)),
        ),
      );
    }),
  );

  return h(
    'div',
    { class: 'view' },
    h(
      'header',
      { class: 'view-head' },
      h('div', {}, h('h1', { class: 'page-title' }, 'Berbagi'), h('p', { class: 'muted' }, 'Tautan berbatas waktu dengan enkripsi ulang. Kunci tidak pernah dikirim ke Pod.')),
      h(
        'div',
        { class: 'row gap-2' },
        btn('Bersihkan kedaluwarsa', 'ghost', async () => {
          const removed = await pruneShares(ctx.adapter);
          toast(removed.length ? `${removed.length} tautan kedaluwarsa dibersihkan` : 'Tidak ada tautan kedaluwarsa', 'info');
          ctx.rerender();
        }),
      ),
    ),
    shares.length === 0
      ? emptyState('Belum ada tautan', 'Buka dokumen lalu pilih “Bagikan” untuk membuat tautan berbatas waktu.')
      : h('div', { class: 'share-list' }, ...rows),
  );
}
