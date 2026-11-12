import type { AppContext } from '../../app.js';
import type { CategoryId, FileRecord } from '../../core/types.js';
import { CATEGORIES } from '../../core/types.js';
import { DuplicateFileError, groupByCategory, searchFiles } from '../../features/vault.js';
import { isExpired } from '../../core/expiry.js';
import { openShareModal } from './share-modal.js';
import {
  badge,
  btn,
  confirmDialog,
  emptyState,
  field,
  formatBytes,
  formatDate,
  h,
  input,
  modal,
  select,
  stat,
  toast,
} from './helpers.js';

export async function vaultView(ctx: AppContext): Promise<HTMLElement> {
  const [files, shares] = await Promise.all([ctx.service.listFiles(), ctx.service.listShares()]);
  const activeShares = shares.filter((s) => !isExpired(s)).length;

  const listHost = h('div', { class: 'vault-list' });
  const search = input({ type: 'search', placeholder: 'Cari nama, kategori, atau tag…', 'aria-label': 'Cari dokumen' });
  let filter: CategoryId | 'semua' = 'semua';

  const chips = h('div', { class: 'chip-row', role: 'tablist', 'aria-label': 'Filter kategori' });
  const renderChips = (): void => {
    chips.replaceChildren(
      ...(['semua', ...CATEGORIES.map((c) => c.id)] as Array<CategoryId | 'semua'>).map((id) => {
        const label = id === 'semua' ? 'Semua' : (CATEGORIES.find((c) => c.id === id)?.label ?? id);
        const count = id === 'semua' ? files.length : files.filter((f) => f.category === id).length;
        return h(
          'button',
          {
            class: `chip${filter === id ? ' is-active' : ''}`,
            type: 'button',
            role: 'tab',
            'aria-selected': filter === id ? 'true' : 'false',
            onclick: () => {
              filter = id;
              renderChips();
              paint();
            },
          },
          `${label} · ${count}`,
        );
      }),
    );
  };

  const paint = (): void => {
    const filtered = searchFiles(files, search.value).filter((f) => filter === 'semua' || f.category === filter);
    listHost.replaceChildren();
    if (filtered.length === 0) {
      listHost.append(
        emptyState(
          files.length === 0 ? 'Brankas masih kosong' : 'Tidak ada yang cocok',
          files.length === 0
            ? 'Unggah dokumen pertama Anda. Isinya dienkripsi sebelum disimpan.'
            : 'Coba kata kunci lain atau ganti filter kategori.',
          files.length === 0 ? btn('Unggah dokumen', 'primary', () => openUpload(ctx)) : undefined,
        ),
      );
      return;
    }
    for (const group of groupByCategory(filtered)) {
      const meta = CATEGORIES.find((c) => c.id === group.id);
      listHost.append(
        h(
          'section',
          { class: 'vault-group' },
          h('header', { class: 'group-head' }, h('h2', {}, meta?.label ?? group.id), h('span', { class: 'muted' }, `${group.files.length} dokumen`)),
          h('div', { class: 'file-grid' }, ...group.files.map((f) => fileCard(ctx, f))),
        ),
      );
    }
  };

  search.addEventListener('input', paint);

  const dropzone = h(
    'div',
    { class: 'dropzone', tabindex: 0, role: 'button', 'aria-label': 'Unggah dokumen' },
    h('span', { class: 'dropzone-icon', 'aria-hidden': 'true' }, '↑'),
    h('div', {}, h('strong', {}, 'Tarik dokumen ke sini'), h('p', { class: 'muted small' }, 'atau klik untuk memilih berkas — PDF, JPG, PNG')),
  );
  dropzone.addEventListener('click', () => openUpload(ctx));
  dropzone.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      openUpload(ctx);
    }
  });
  dropzone.addEventListener('dragover', (ev) => {
    ev.preventDefault();
    dropzone.classList.add('is-over');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('is-over'));
  dropzone.addEventListener('drop', async (ev) => {
    ev.preventDefault();
    dropzone.classList.remove('is-over');
    const dropped = Array.from(ev.dataTransfer?.files ?? []);
    if (dropped.length === 0) return;
    await uploadFiles(ctx, dropped, filter === 'semua' ? 'lainnya' : filter);
  });

  renderChips();
  paint();

  return h(
    'div',
    { class: 'view' },
    h(
      'header',
      { class: 'view-head' },
      h('div', {}, h('h1', { class: 'page-title' }, 'Brankas'), h('p', { class: 'muted' }, 'Dokumen tersimpan sebagai ciphertext. Hanya perangkat ini yang memegang kunci.')),
      h('div', { class: 'row gap-2' }, btn('Unggah dokumen', 'primary', () => openUpload(ctx))),
    ),
    h(
      'div',
      { class: 'stat-row' },
      stat('Dokumen', String(files.length), 'terenkripsi AES-GCM-256'),
      stat('Total ukuran', formatBytes(files.reduce((n, f) => n + f.size, 0)), 'plaintext, sebelum enkripsi'),
      stat('Berbagi aktif', String(activeShares), 'tautan belum kedaluwarsa'),
    ),
    h('div', { class: 'vault-toolbar' }, search, h('div', { class: 'chip-scroll' }, chips)),
    dropzone,
    listHost,
  );
}

function fileCard(ctx: AppContext, file: FileRecord): HTMLElement {
  const meta = CATEGORIES.find((c) => c.id === file.category);
  const ext = (file.name.split('.').pop() ?? 'file').toUpperCase().slice(0, 4);
  const card = h(
    'article',
    { class: 'file-card', tabindex: 0, role: 'button', 'aria-label': `Buka ${file.name}` },
    h('div', { class: 'file-glyph', 'aria-hidden': 'true' }, ext),
    h(
      'div',
      { class: 'file-main' },
      h('h3', { class: 'file-name' }, file.name),
      h('p', { class: 'muted small' }, `${formatBytes(file.size)} · ${formatDate(file.createdAt)}`),
      h('div', { class: 'row gap-1' }, badge(meta?.label ?? file.category, 'accent'), ...file.tags.slice(0, 2).map((t) => badge(`#${t}`))),
    ),
    h(
      'div',
      { class: 'file-actions' },
      btn('Buka', 'ghost', (ev) => {
        ev.stopPropagation();
        ctx.navigate(`#/file/${file.id}`);
      }),
      btn('Bagikan', 'ghost', (ev) => {
        ev.stopPropagation();
        openShareModal(ctx, file);
      }),
      btn('Hapus', 'danger', async (ev) => {
        ev.stopPropagation();
        if (!(await confirmDialog('Hapus dokumen?', `“${file.name}” akan dihapus permanen dari penyimpanan ini.`))) return;
        await ctx.service.deleteFile(file.id);
        toast('Dokumen dihapus', 'ok');
        ctx.rerender();
      }),
    ),
  );
  const open = (): void => ctx.navigate(`#/file/${file.id}`);
  card.addEventListener('click', open);
  card.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      open();
    }
  });
  return card;
}

function openUpload(ctx: AppContext): void {
  const picker = input({ type: 'file', multiple: true, accept: '.pdf,.png,.jpg,.jpeg,.txt,application/pdf,image/*' });
  const category = select(CATEGORIES.map((c) => ({ value: c.id, label: c.label })), { value: 'lainnya' });
  const tags = input({ type: 'text', placeholder: 'opsional, pisahkan dengan koma' });

  const dialog = modal({
    title: 'Unggah dokumen',
    body: h(
      'div',
      {},
      field('Berkas', picker),
      field('Kategori', category),
      field('Tag', tags),
      h('p', { class: 'notice' }, 'Berkas dibaca ke memori, dienkripsi, lalu plaintext dibuang. Tidak ada unggahan plaintext.'),
    ),
    actions: [
      { label: 'Batal' },
      {
        label: 'Unggah',
        variant: 'primary',
        keepOpen: true,
        onClick: async () => {
          const chosen = Array.from(picker.files ?? []);
          if (chosen.length === 0) {
            toast('Pilih berkas terlebih dahulu', 'err');
            return;
          }
          const tagList = tags.value
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean);
          const ok = await uploadFiles(ctx, chosen, category.value as CategoryId, tagList);
          if (ok) dialog.close();
        },
      },
    ],
  });
}

async function uploadFiles(ctx: AppContext, files: File[], category: CategoryId, tags: string[] = []): Promise<boolean> {
  let added = 0;
  let duplicates = 0;
  let failed = 0;
  for (const file of files) {
    try {
      await ctx.service.addFile(file, category, tags);
      added++;
    } catch (err) {
      if (err instanceof DuplicateFileError) duplicates++;
      else failed++;
    }
  }
  if (added > 0) toast(`${added} dokumen terenkripsi dan disimpan`, 'ok');
  if (duplicates > 0) toast(`${duplicates} dokumen identik dilewati (anti-duplikasi)`, 'info', 6000);
  if (failed > 0) toast(`${failed} dokumen gagal diunggah`, 'err', 6000);
  if (added > 0) ctx.rerender();
  return added > 0;
}
