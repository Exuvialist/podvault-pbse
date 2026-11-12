import type { AppContext } from '../../app.js';
import { verifyAudit } from '../../core/audit.js';
import { toB64u, toHex } from '../../core/bytes.js';
import { badge, btn, confirmDialog, copyText, downloadJson, downloadText, field, h, input, select, toast } from './helpers.js';
import { getStandaloneDecryptorHtml } from './decryptor-template.js';

export async function settingsView(ctx: AppContext): Promise<HTMLElement> {
  const config = await ctx.service.readConfig();
  const unlocked = ctx.service.isUnlocked;

  const usePod = input({ type: 'checkbox', checked: Boolean(ctx.settings.podUrl.trim()) });
  const podUrl = input({ type: 'url', value: ctx.settings.podUrl, placeholder: 'https://pod.example.com/', spellcheck: false });
  const token = input({ type: 'password', value: ctx.settings.token, placeholder: 'Bearer token (opsional untuk Pod publik)', autocomplete: 'off' });
  const webId = input({ type: 'url', value: ctx.settings.webId || config?.webId || '', placeholder: 'https://pod.example.com/profile/card#me', spellcheck: false });

  const podFields = h('div', { class: 'stack' }, field('URL Pod', podUrl, 'Contoh: Community Solid Server di http://localhost:3000/'), field('Access token', token, 'Fase 1 memakai Bearer token manual. OIDC + DPoP ada di Fase 2.'), field('WebID', webId));
  const syncPod = (): void => {
    podFields.hidden = !usePod.checked;
  };
  usePod.addEventListener('change', syncPod);
  syncPod();

  const watermarkIp = input({ type: 'checkbox', checked: ctx.settings.watermarkIp });
  const autoLock = select(
    [
      { value: '0', label: 'Nonaktif' },
      { value: '60', label: '1 menit' },
      { value: '300', label: '5 menit' },
      { value: '900', label: '15 menit' },
    ],
    { value: String(ctx.settings.autoLockSeconds) },
  );

  return h(
    'div',
    { class: 'standalone' },
    h(
      'header',
      { class: 'standalone-head' },
      h('a', { href: unlocked ? '#/vault' : '#/unlock', class: 'link small' }, '← Kembali'),
      h('div', { class: 'row gap-1' }, h('span', { class: 'seal small', 'aria-hidden': 'true' }, '◈'), h('strong', { class: 'wordmark small' }, 'PodVault')),
    ),
    h('h1', { class: 'page-title' }, 'Pengaturan'),
    h(
      'div',
      { class: 'settings-grid' },
      h(
        'section',
        { class: 'card' },
        h('h2', { class: 'card-title' }, 'Penyimpanan'),
        h('label', { class: 'check-row' }, usePod, h('span', {}, 'Gunakan Solid Pod (selain IndexedDB perangkat ini)')),
        podFields,
        h('p', { class: 'notice' }, 'Mengganti penyimpanan akan memuat ulang aplikasi. Brankas di penyimpanan lama tidak ikut berpindah.'),
        btn('Simpan & muat ulang', 'primary', () => {
          ctx.updateSettings({
            podUrl: usePod.checked ? podUrl.value.trim() : '',
            token: usePod.checked ? token.value.trim() : '',
            webId: webId.value.trim(),
          });
          window.location.reload();
        }),
      ),
      h(
        'section',
        { class: 'card' },
        h('h2', { class: 'card-title' }, 'Keamanan tampilan'),
        h('label', { class: 'check-row' }, watermarkIp, h('span', {}, 'Sertakan IP publik di watermark (memanggil api.ipify.org)')),
        h('p', { class: 'muted small' }, 'Nonaktif secara bawaan: memanggil layanan pihak ketiga membocorkan IP Anda.'),
        field('Kunci otomatis saat idle', autoLock),
        btn('Simpan', 'ghost', async () => {
          const patch = { watermarkIp: watermarkIp.checked, autoLockSeconds: Number(autoLock.value) };
          ctx.updateSettings(patch);
          if (unlocked) {
            await ctx.service.updateSettings(patch);
          }
          toast('Pengaturan disimpan', 'ok');
        }),
      ),
      unlocked && ctx.service.unlocked
        ? h(
            'section',
            { class: 'card' },
            h('h2', { class: 'card-title' }, 'Kunci Universal & Anti Vendor Lock-in'),
            h(
              'p',
              { class: 'muted' },
              'Kunci Master (256-bit) ini dapat membuka seluruh dokumen di brankas Anda. Simpan kunci ini jika Anda ingin mendekripsi dokumen secara mandiri di masa depan tanpa melalui aplikasi PodVault.',
            ),
            h(
              'div',
              { class: 'stack gap-2' },
              field(
                'Kunci Universal (Hexadecimal)',
                input({
                  type: 'text',
                  value: toHex(ctx.service.unlocked.masterKeyRaw),
                  readonly: true,
                  class: 'input mono',
                  spellcheck: false,
                }),
                'Standar AES-GCM-256 (64 karakter hex). Kunci ini membuka semua File Key (FK) di brankas Anda.',
              ),
              h(
                'div',
                { class: 'row gap-2' },
                btn('Salin kunci (Hex)', 'ghost', () => {
                  copyText(toHex(ctx.service.unlocked!.masterKeyRaw));
                  toast('Kunci Universal disalin', 'ok');
                }),
                btn('Unduh file kunci (.txt)', 'ghost', () => {
                  const hex = toHex(ctx.service.unlocked!.masterKeyRaw);
                  const b64 = toB64u(ctx.service.unlocked!.masterKeyRaw);
                  const txt = [
                    '====================================================',
                    '  PODVAULT UNIVERSAL MASTER KEY (ANTI VENDOR LOCK-IN)',
                    '====================================================',
                    `WebID       : ${config?.webId ?? ctx.service.webId}`,
                    `Algoritma   : AES-GCM-256 (NIST SP 800-38D)`,
                    `Dibuat pada : ${config?.createdAt ?? new Date().toISOString()}`,
                    '',
                    'KUNCI MASTER (HEX / 64 KARAKTER):',
                    hex,
                    '',
                    'KUNCI MASTER (BASE64URL):',
                    b64,
                    '',
                    'PANDUAN PEMULIHAN TANPA PODVAULT:',
                    '1. Kunci ini adalah kunci simetris 256-bit tunggal untuk seluruh isi brankas.',
                    '2. Setiap berkas dienkripsi dengan File Key (FK), dan FK dibungkus oleh Master Key ini.',
                    '3. Anda dapat mendekripsi berkas kapan saja menggunakan Standalone Offline Decryptor (.html)',
                    '   atau menggunakan script Python di folder scripts/decrypt_offline.py:',
                    '   python decrypt_offline.py <MASTER_KEY_HEX> <file.json> <output.pdf>',
                    '====================================================',
                  ].join('\n');
                  downloadText('podvault-universal-master-key.txt', txt);
                  toast('File kunci diunduh', 'ok');
                }),
                btn('Unduh Standalone Decryptor (.html)', 'primary', () => {
                  downloadText('podvault-offline-decryptor.html', getStandaloneDecryptorHtml(), 'text/html');
                  toast('Standalone Decryptor diunduh', 'ok');
                }),
              ),
            ),
          )
        : h(
            'section',
            { class: 'card' },
            h('h2', { class: 'card-title' }, 'Kunci Universal & Anti Vendor Lock-in'),
            h('p', { class: 'muted' }, 'Buka brankas terlebih dahulu untuk melihat dan mengekspor Kunci Universal brankas Anda.'),
          ),
      h(
        'section',
        { class: 'card' },
        h('h2', { class: 'card-title' }, 'Audit log'),
        h('p', { class: 'muted' }, 'Setiap aksi dicatat dalam rantai hash SHA-256. Jika satu entri diubah, verifikasi gagal.'),
        h(
          'div',
          { class: 'row gap-2' },
          btn('Verifikasi rantai', 'ghost', async () => {
            const events = await ctx.service.readAudit();
            const ok = await verifyAudit(events);
            toast(ok ? `Rantai valid (${events.length} entri)` : 'Rantai audit rusak atau dimodifikasi', ok ? 'ok' : 'err', 6000);
          }),
          btn('Ekspor JSON', 'ghost', async () => {
            downloadJson('podvault-audit.json', await ctx.service.readAudit());
          }),
        ),
      ),
      h(
        'section',
        { class: 'card' },
        h('h2', { class: 'card-title' }, 'Tentang'),
        h(
          'dl',
          { class: 'kv' },
          h('dt', {}, 'Versi'), h('dd', {}, '0.1.0 (MVP)'),
          h('dt', {}, 'Penyimpanan'), h('dd', {}, ctx.storageLabel),
          h('dt', {}, 'WebID'), h('dd', { class: 'mono' }, config?.webId ?? ctx.settings.webId ?? '—'),
          h('dt', {}, 'KDF'), h('dd', { class: 'mono' }, config ? `PBKDF2-SHA256 · ${config.kdf.iterations.toLocaleString('id-ID')} iterasi` : '—'),
          h('dt', {}, 'Status'), h('dd', {}, unlocked ? badge('Terbuka', 'ok') : badge('Terkunci', 'warn')),
        ),
      ),
      h(
        'section',
        { class: 'card danger-zone' },
        h('h2', { class: 'card-title' }, 'Zona berbahaya'),
        h('p', { class: 'muted' }, 'Menghapus brankas menghilangkan ciphertext dan kunci terbungkus di penyimpanan ini. Tanpa Recovery Sheet, data tidak dapat dipulihkan.'),
        btn('Hapus brankas di penyimpanan ini', 'danger', async () => {
          if (!(await confirmDialog('Hapus brankas?', 'Tindakan ini permanen dan tidak dapat dibatalkan.', 'Hapus permanen'))) return;
          const paths = await ctx.adapter.list('/vault/');
          for (const path of paths) await ctx.adapter.remove(path);
          toast('Brankas dihapus. Memuat ulang…', 'info');
          setTimeout(() => window.location.reload(), 800);
        }),
      ),
    ),
  );
}
