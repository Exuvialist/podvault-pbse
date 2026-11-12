# PodVault — MVP

Brankas dokumen kedaulatan mandiri: SPA tanpa backend yang mengenkripsi dokumen di peramban
(AES-GCM-256) dan menyimpan **ciphertext** di Solid Pod atau IndexedDB lokal.

> Spesifikasi produk: `docs/SPEC-SUMMARY.md` · Arsitektur: `docs/ARCHITECTURE.md` · Keamanan: `docs/SECURITY.md`

## Quickstart

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # unit test (vitest)
npm run build        # typecheck + bundle
```

Alur demo 3 menit:

1. **Buat brankas** — WebID bebas (mis. `https://demo.pod/profile#me`), passphrase ≥ 12 karakter.
2. **Unggah** `samples/sertifikat-tanah.pdf` ke kategori *Kepemilikan Aset*.
3. **Buka** dokumen → PDF dirender ke `<canvas>` dengan watermark forensik; coba `Ctrl/Cmd+P`, klik kanan, dan seleksi teks.
4. **Bagikan** 1 jam dengan passphrase → buka tautan di tab baru → penerima memasukkan passphrase.
5. **Pemulihan** → buat 3-dari-5 → cetak lembar → salin 3 kode share → pulihkan di tab baru.

## Fitur MVP

| Fitur | Status | Catatan |
|---|---|---|
| Enkripsi klien AES-GCM-256 + PBKDF2 600k | ✅ | `src/core/keys.ts` |
| Direktori berkas berkategori + pencarian | ✅ | Kependudukan, Kesehatan, Finansial, Aset, Lainnya |
| Secure view-only renderer (PDF.js → canvas) | ✅ | Blokir cetak/salin/klik kanan, render per halaman |
| Watermark forensik (WebID + IP + UTC) | ✅ | Dibakar ke piksel + lapisan DOM |
| Tautan berbagi berbatas waktu | ✅ | Kunci di URL fragment atau dibungkus passphrase |
| Emergency Recovery Sheet (Shamir 3-of-5) | ✅ | Cetak A4 + QR per share |
| Penyimpanan Solid Pod | ✅ (adapter) | Bearer token manual; OIDC/DPoP = Fase 2 |
| Audit log ber-rantai hash | ✅ | `audit.json`, verifikasi di Pengaturan |
| Manifest RDF (JSON-LD + Turtle) | ✅ | Metadata non-rahasia saja |
| Passkeys / WebAuthn PRF | ⏳ Fase 2 | Tombol ditandai "Fase 2" |
| ACP/WAC granular + federasi | ⏳ Fase 3 | |

## Struktur

```
src/
  core/        # kripto murni: bytes, crypto, keys, shamir, manifest, audit, expiry
  storage/     # adapter: local (IndexedDB), solid (REST), memory (test), config
  features/    # vault service, viewer, share, recovery
  ui/          # shell, dom helpers, styles, views/
docs/          # arsitektur, keamanan, deployment
samples/       # PDF contoh untuk demo
scripts/       # generator PDF contoh
```

## Batasan yang disengaja

Lihat `docs/SECURITY.md` §3. Ringkasnya: anti-screenshot tidak mungkin di peramban; kedaluwarsa
tautan ditegakkan di klien; nama file tidak dienkripsi; passkey belum aktif.
