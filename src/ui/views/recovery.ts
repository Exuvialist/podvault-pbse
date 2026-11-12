import type { AppContext } from '../../app.js';
import { createRecoveryKit, parseShares, recoverMasterKeyRaw, renderRecoverySheet } from '../../features/recovery.js';
import { badge, btn, field, h, input, modal, select, textarea, toast } from './helpers.js';

export async function recoveryView(ctx: AppContext): Promise<HTMLElement> {
  const config = await ctx.service.readConfig();
  const unlocked = ctx.service.isUnlocked;

  if (!config) {
    return page(
      h('div', { class: 'card' }, h('h2', {}, 'Belum ada brankas'), h('p', { class: 'muted' }, 'Buat brankas terlebih dahulu untuk membuat Recovery Sheet.')),
    );
  }

  const generate = unlocked ? generateCard(ctx) : lockedNotice();
  const restore = restoreCard(ctx);

  return page(
    h(
      'div',
      { class: 'recovery-grid' },
      generate,
      restore,
      h(
        'section',
        { class: 'card' },
        h('h2', { class: 'card-title' }, 'Status pemulihan'),
        config.recovery
          ? h(
              'div',
              {},
              h('div', { class: 'row gap-1' }, badge(`${config.recovery.threshold}-dari-${config.recovery.shares}`, 'ok'), badge('aktif', 'ok')),
              h('p', { class: 'muted small' }, `Dibuat ${new Date(config.recovery.createdAt).toLocaleString('id-ID')}`),
              h('p', { class: 'mono small' }, `Sidik jari MK: ${config.recovery.fingerprint}`),
            )
          : h('p', { class: 'muted' }, 'Belum ada Recovery Sheet. Tanpa ini, passphrase yang hilang berarti arsip hilang permanen.'),
      ),
    ),
  );
}

function page(inner: HTMLElement): HTMLElement {
  return h(
    'div',
    { class: 'standalone' },
    h(
      'header',
      { class: 'standalone-head' },
      h('a', { href: '#/unlock', class: 'link small' }, '← Kembali'),
      h('div', { class: 'row gap-1' }, h('span', { class: 'seal small', 'aria-hidden': 'true' }, '◈'), h('strong', { class: 'wordmark small' }, 'PodVault')),
    ),
    h('h1', { class: 'page-title' }, 'Pemulihan & Cadangan'),
    h('p', { class: 'muted' }, 'Lembar kertas ini memulihkan kunci master tanpa passphrase. Perlakukan seperti uang tunai.'),
    inner,
  );
}

function lockedNotice(): HTMLElement {
  return h(
    'section',
    { class: 'card' },
    h('h2', { class: 'card-title' }, 'Buat Recovery Sheet'),
    h('p', { class: 'muted' }, 'Buka brankas terlebih dahulu untuk membagi kunci master menjadi lembar pemulihan.'),
    btn('Buka brankas', 'primary', () => ctxNavigate('#/unlock')),
  );
}

function ctxNavigate(hash: string): void {
  window.location.hash = hash;
}

function generateCard(ctx: AppContext): HTMLElement {
  const k = select(
    [2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n} share` })),
    { value: '3' },
  );
  const n = select(
    [3, 4, 5, 6, 7].map((v) => ({ value: String(v), label: `${v} lembar` })),
    { value: '5' },
  );

  return h(
    'section',
    { class: 'card' },
    h('h2', { class: 'card-title' }, 'Buat Recovery Sheet'),
    h('p', { class: 'muted' }, 'Kunci master dipecah dengan Shamir Secret Sharing. Ambang menentukan berapa lembar yang diperlukan untuk memulihkan.'),
    h('div', { class: 'row gap-2' }, field('Ambang', k), field('Jumlah lembar', n)),
    btn('Buat & cetak', 'primary', async () => {
      const threshold = Number(k.value);
      const total = Number(n.value);
      if (threshold > total) {
        toast('Ambang tidak boleh melebihi jumlah lembar', 'err');
        return;
      }
      const session = ctx.service.unlocked;
      if (!session) {
        toast('Brankas terkunci', 'err');
        return;
      }
      const kit = await createRecoveryKit(session, threshold, total);
      await ctx.service.setRecovery({
        threshold,
        shares: total,
        createdAt: kit.createdAt,
        fingerprint: kit.fingerprint,
      });
      const sheet = await renderRecoverySheet({ kit });
      modal({
        title: 'Emergency Recovery Sheet',
        wide: true,
        body: h('div', {}, h('p', { class: 'notice warn' }, 'Cetak sekarang. Layar ini menampilkan kunci master dalam bentuk share — jangan disimpan sebagai gambar.'), sheet),
        actions: [{ label: 'Tutup' }, { label: 'Cetak', variant: 'primary', onClick: () => window.print() }],
      });
    }),
  );
}

function restoreCard(ctx: AppContext): HTMLElement {
  const area = textarea({ rows: 5, placeholder: 'Tempel minimal 3 baris kode share…', spellcheck: false, class: 'textarea mono' });
  const newPass = input({ type: 'password', placeholder: 'Passphrase baru (min. 12 karakter)', autocomplete: 'new-password' });

  return h(
    'section',
    { class: 'card' },
    h('h2', { class: 'card-title' }, 'Pulihkan brankas'),
    h('p', { class: 'muted' }, 'Masukkan kode share dari lembar kertas. Pemulihan menghasilkan kunci master yang sama, lalu Anda menetapkan passphrase baru.'),
    field('Kode share', area, 'Format: podvault:share:v1:<x>:<y> — satu per baris.'),
    field('Passphrase baru', newPass),
    btn('Pulihkan', 'primary', async () => {
      let shares;
      try {
        shares = parseShares(area.value);
      } catch (err) {
        toast(`Format tidak valid: ${(err as Error).message}`, 'err', 6000);
        return;
      }
      if (shares.length < 2) {
        toast('Minimal 2 share diperlukan', 'err');
        return;
      }
      try {
        const raw = await recoverMasterKeyRaw(shares);
        await ctx.service.unlockWithMasterKey(raw);
        if (newPass.value.length >= 12) {
          await ctx.service.changePassphrase(newPass.value);
          toast('Brankas dipulihkan dan passphrase diperbarui', 'ok', 6000);
        } else {
          toast('Brankas dipulihkan. Passphrase belum diubah.', 'info', 6000);
        }
        ctx.navigate('#/vault');
      } catch (err) {
        toast(`Pemulihan gagal: ${(err as Error).message}`, 'err', 6000);
      }
    }),
  );
}
