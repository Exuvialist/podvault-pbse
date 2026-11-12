# PodVault: Secure Private Document Sharing Platform

> **Brankas Dokumen Kedaulatan Mandiri Berbasis DWeb (W3C Solid Pod) & Zero-Knowledge Client Security**  
> Proyek Mata Kuliah: *Platform-Based Software Engineering* — Universitas Gadjah Mada (2026)

[![TypeScript](https://img.shields.io/badge/Language-TypeScript%205.9-blue.svg)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Bundler-Vite%208.3-646CFF.svg)](https://vitejs.dev/)
[![Security](https://img.shields.io/badge/Encryption-AES--GCM--256-green.svg)](https://csrc.nist.gov/publications/detail/sp/800-38d/final)
[![Tests](https://img.shields.io/badge/Unit%20Tests-67%2F67%20Passed-brightgreen.svg)]()
[![QA E2E](https://img.shields.io/badge/QA%20E2E-27%2F27%20Passed-brightgreen.svg)]()
[![Platform](https://img.shields.io/badge/Storage-W3C%20Solid%20Pod-7C3AED.svg)](https://solidproject.org/)

---

## 📌 1. Gambaran Umum (Overview)

**PodVault** adalah aplikasi peramban independen (*Zero-Backend Single Page Application*) yang dirancang untuk mengarsipkan, mengelola, dan membagikan dokumen berharga (KTP, sertifikat tanah, rekam medis pasien, polis asuransi, dan dokumen legalitas) tanpa menitipkan data ke basis data pihak ketiga.

### Masalah yang Diselesaikan:
1. **Risiko Pencurian Massal di Cloud (*Honeypot Target*):** Penyimpanan awan konvensional (Google Drive, Dropbox) mengumpulkan jutaan data pengguna di satu basis data pusat. Jika server pusat bobol, jutaan data bocor sekaligus.
2. **Ketergantungan & Pengawasan Platform (*Vendor Lock-in & Surveillance*):** Dokumen pengguna dipindai oleh algoritma perantara dan akun berisiko disuspend sepihak.
3. **Kelemahan Harddisk Fisik Lokal:** Aman dari peretas internet, tetapi rentan rusak fisik, terkena malware lokal, atau hilang, serta tidak fleksibel saat dibutuhkan mendesak.
4. **Dilema Berbagi Dokumen (*The Document Sharing Dilemma*):** Mengirim dokumen berharga via WhatsApp/Email menyebabkan file mentah tersimpan permanen di database pihak ketiga tanpa mekanisme penarikan kembali (*revocation*).

### Solusi PodVault:
* **Zero-Knowledge Architecture:** Seluruh proses enkripsi diselesaikan langsung di RAM peramban (*client-side*) menggunakan **AES-GCM-256** sebelum file dikirim. File mentah tidak pernah menyentuh harddisk tanpa enkripsi atau melewati server perantara.
* **Kedaulatan Data Penuh (W3C Solid Pod):** Dokumen disimpan di *Personal Online Datastore* (Pod) milik pengguna. Server Pod murni bertindak sebagai wadah biner pasif yang hanya menerima *ciphertext* acak.

---

## 🏗️ 2. Arsitektur Inti Sistem

PodVault memisahkan sistem menjadi tiga lapisan fungsional yang sepenuhnya terisolasi:

```
[ Pengguna di Browser ]
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. CLIENT ENGINE (TypeScript + Web Crypto API + PDF.js)    │
│    - Menjalankan enkripsi AES-GCM-256 di memori volatile    │
│    - Merender dokumen ke HTML5 <canvas> (Anti-Duplikasi)    │
│    - Menempelkan Dynamic Forensic Watermark                │
└─────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. IDENTITY & KEY LAYER (Envelope Encryption)               │
│    - KEK: Diturunkan dari Passphrase (PBKDF2 600k iterasi) │
│    - Master Key (MK): 32-byte acak (Kunci Universal)       │
│    - File Key (FK): 32-byte acak per file (dibungkus MK)    │
│    - Shamir's Secret Sharing (3-dari-5) untuk Recovery      │
└─────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. STORAGE LAYER (W3C Linked Data Platform / IndexedDB)     │
│    - Solid Pod (W3C LDP REST): Wadah penyimpanan pasif      │
│    - IndexedDB: Penyimpanan lokal untuk mode offline        │
│    - Server HANYA menerima Ciphertext acak & Metadata RDF   │
└─────────────────────────────────────────────────────────────┘
```

---

## ✨ 3. Fitur-Fitur Utama PodVault

| Fitur | Keterangan & Implementasi |
| :--- | :--- |
| **Zero-Knowledge Categorized Vault** | Pengorganisasian dokumen terstruktur (*Kependudukan, Kesehatan, Finansial, Kepemilikan Aset, Lainnya*) yang dipetakan dalam bentuk graf semantik RDF (Linked Data). |
| **Secure View-Only Renderer** | Pencegahan duplikasi berkas dengan merender dokumen menggunakan PDF.js langsung ke elemen HTML5 `<canvas>`. Menghindari Object URL, mematikan klik kanan, shortcut cetak (`Ctrl+P`), simpan (`Ctrl+S`), dan seleksi teks. |
| **Dynamic Forensic Watermark** | Watermark transparan dinamis yang dibakar langsung ke piksel kanvas, memuat WebID pengakses, alamat IP klien, dan stempel waktu UTC presisi guna menangkal kebocoran via foto kamera HP. |
| **Time-Limited Ephemeral Sharing** | Berbagi dokumen sementara ke pihak ketiga dengan enkripsi ulang menggunakan kunci acak sekali pakai (*throwaway key*). Tautan otomatis kedaluwarsa (1-24 jam) dan kunci pembuka diletakkan pada URL fragment (`#key=...`) sehingga tidak pernah dikirim ke server. |
| **Emergency Recovery Sheet** | Kunci master dipecah menjadi 5 bagian (*shares*) menggunakan algoritma matematika **Shamir's Secret Sharing GF(256)**. Cukup 3 bagian sembarang untuk memulihkan brankas jika gawai rusak. Dilengkapi lembar cetak A4 ber-QR Code. |
| **Anti Vendor Lock-in & Kunci Universal** | Pengguna dapat mengekspor **Kunci Universal (Master Key 256-bit Hex)** dan mengunduh berkas **Standalone Offline Decryptor (.html)** atau skrip Python untuk mendekripsi berkas secara mandiri di luar aplikasi PodVault. |
| **Tamper-Evident Hash-Chained Audit Log** | Setiap aktivitas (unggah, buka, hapus, bagikan, pulihkan) dicatat dalam rantai hash SHA-256 (`prevHash -> hash`). Jika ada entri yang dimodifikasi, verifikasi otomatis gagal. |
| **Pencegahan Duplikasi Berkas** | Deteksi berkas ganda menggunakan hash SHA-256 plaintext untuk mencegah pemborosan kuota penyimpanan. |

---

## 🔄 4. Alur Penggunaan Lengkap (Usage Flow)

### Skenario A: Menginisialisasi & Membuka Brankas
1. Buka aplikasi di peramban (`http://localhost:5173/`).
2. Masukkan **WebID Solid** Anda (misal: `https://username.solidcommunity.net/profile/card#me` atau gunakan default untuk demo lokal).
3. Masukkan **Passphrase** (minimal 12 karakter).
4. Klik **"Buat brankas"** ➔ Browser menurunkan KEK melalui PBKDF2 (600.000 iterasi) dan membuat Master Key 256-bit di RAM.

### Skenario B: Mengunggah & Mengamankan Dokumen
1. Pilih kategori dokumen yang sesuai (*Kependudukan, Kesehatan, Finansial, Aset, Lainnya*).
2. Unggah file dokumen (tersedia file contoh di folder `samples/sertifikat-tanah.pdf`).
3. Browser membuat File Key (FK) unik, mengenkripsi dokumen dengan **AES-GCM-256**, membungkus FK dengan Master Key, dan menyimpan ciphertext ke Solid Pod / IndexedDB.
4. Coba unggah file yang sama persis ➔ Sistem menolak secara otomatis dengan proteksi anti-duplikasi.

### Skenario C: Membuka Dokumen dengan Proteksi Visual
1. Klik berkas dokumen yang ingin dilihat ➔ Klik tombol **"Buka dokumen"**.
2. Dokumen digambar langsung ke elemen HTML5 `<canvas>`.
3. Perhatikan watermark transparan memuat identitas WebID dan stempel waktu UTC.
4. Coba klik kanan, tekan `Ctrl+P`, tekan `Ctrl+S`, atau seleksi teks ➔ Seluruh aksi duplikasi terblokir.

### Skenario D: Membagikan Dokumen Sementara (Ephemeral Sharing)
1. Klik tombol **"Bagikan"** pada halaman rincian dokumen.
2. Tentukan durasi masa berlaku (misal: 1 jam).
3. (Opsional) Tetapkan passphrase tambahan untuk pihak penerima.
4. Salin tautan yang dihasilkan dan buka di **Jendela Samaran (Incognito Window)**.
5. Pihak penerima dapat melihat dokumen dengan watermark khusus pihak luar, dan akses akan tertutup otomatis saat durasi habis.

### Skenario E: Mencetak Lembar Pemulihan Darurat (Disaster Recovery)
1. Masuk ke tab **Pemulihan (*Recovery*)**.
2. Pilih ambang batas (default: 3-dari-5).
3. Klik **"Buat & cetak"** ➔ Muncul tampilan lembar A4 siap cetak berisi 5 QR Code bagian Shamir.
4. Simpan lembaran fisik ini di tempat aman (misal brankas fisik) untuk memulihkan akun tanpa passphrase jika perangkat hilang.

### Skenario F: Mengakses Berkas Tanpa PodVault (Anti Vendor Lock-in)
Jika suatu saat pengguna tidak ingin menggunakan aplikasi PodVault lagi:
1. Buka menu **Pengaturan (*Settings*)** ➔ Bagian **"Kunci Universal & Anti Vendor Lock-in"**.
2. Salin **Kunci Universal (Master Key Hex 64-karakter)** atau unduh file `podvault-universal-master-key.txt`.
3. Unduh berkas **Standalone Offline Decryptor HTML** dengan menekan tombol **"Unduh Standalone Decryptor (.html)"**.
4. Di halaman detail berkas, klik **"Unduh Ciphertext (.json)"**.
5. Buka berkas `podvault-offline-decryptor.html` langsung di browser secara **100% offline**:
   * Tempelkan Master Key Hex.
   * Pilih berkas `.json` ciphertext.
   * Klik **"Dekripsi Dokumen Asli"** ➔ Dokumen asli langsung dipulihkan secara mandiri!
6. *Alternatif CLI:* Anda juga dapat menjalankan skrip Python mandiri dari terminal:
   ```bash
   python scripts/decrypt_offline.py <MASTER_KEY_HEX> <file.encrypted.json> output.pdf
   ```

---

## 🚀 5. Panduan Menjalankan Proyek (Quickstart)

### Prasyarat
* [Node.js](https://nodejs.org/) versi $\ge 18$
* npm versi $\ge 9$

### Instalasi & Menjalankan Dev Server
```bash
# 1. Masuk ke direktori proyek
cd podvault-mvp/podvault-mvp

# 2. Pasang dependensi
npm install

# 3. Jalankan server lokal
npm run dev
```
Akses aplikasi melalui peramban di: **`http://localhost:5173/`**

### Menjalankan Pengujian Otomatis
```bash
# Jalankan 67 Unit Tests (Vitest)
npm test

# Jalankan Typecheck TypeScript
npm run typecheck

# Bangun bundel produksi (Dist)
npm run build
```

---

## 📁 6. Struktur Direktori Proyek

```text
podvault-mvp/
├── docs/                           # Dokumentasi teknis & arsitektur
│   ├── ARCHITECTURE.md             # Diagram modul & alur data
│   ├── CONTRACT.md                 # Interface baku kriptografi
│   ├── DEPLOY.md                   # Panduan deployment & CSP headers
│   ├── SECURITY.md                 # Model keamanan & batasan desain
│   └── SPEC-SUMMARY.md             # Ringkasan spesifikasi produk
├── src/
│   ├── core/                       # Kriptografi & logika domain murni
│   │   ├── audit.ts                # Tamper-evident hash-chained audit log
│   │   ├── bytes.ts                # Utilitas konversi biner & memory wipe
│   │   ├── crypto.ts               # Primitif WebCrypto (AES-GCM-256, PBKDF2)
│   │   ├── expiry.ts               # Logika kedaluwarsa & TTL tautan
│   │   ├── keys.ts                 # Hierarki kunci (KEK, MK, FK)
│   │   ├── manifest.ts             # Proyeksi graf semantik RDF Turtle / JSON-LD
│   │   ├── shamir.ts               # Matematika Shamir's Secret Sharing GF(256)
│   │   └── types.ts                # Definisi tipe TypeScript bersama
│   ├── features/                   # Layanan fitur aplikasi
│   │   ├── net.ts                  # Resolver IP klien untuk watermark
│   │   ├── recovery.ts             # Generator recovery sheet & parser share
│   │   ├── share.ts                # Layanan ephemeral sharing
│   │   ├── vault.ts                # Layanan CRUD dokumen & anti-duplikasi
│   │   └── viewer.ts               # Secure Canvas PDF viewer & watermark
│   ├── storage/                    # Abstraksi layer penyimpanan
│   │   ├── adapter.ts              # Antarmuka StorageAdapter
│   │   ├── local.ts                # Adapter IndexedDB lokal
│   │   ├── memory.ts               # Adapter memori untuk unit test
│   │   └── solid.ts                # Adapter REST client W3C Solid Pod (LDP)
│   └── ui/                         # Antarmuka pengguna (Vanilla TypeScript + CSS)
│       ├── views/                  # Tampilan halaman (Vault, File, Share, Settings, dll.)
│       ├── dom.ts                  # DOM toolkit aman (text-only, bebas XSS)
│       ├── shell.ts                # Navigasi & state shell aplikasi
│       └── styles.css              # Desain responsif tema gelap (Dark Theme)
├── scripts/                        # Skrip pembantu & CLI offline
│   ├── decrypt_offline.py          # Standalone Python CLI Decryptor
│   └── make-sample-pdf.mjs         # Generator dokumen uji coba
├── samples/                        # Berkas PDF contoh untuk demonstrasi
├── qa/                             # Laporan QA & tangkapan layar pengujian E2E
├── podvault-offline-decryptor.html  # Standalone Single-File Web Decryptor
├── index.html                      # Titik masuk aplikasi web
└── package.json                    # Konfigurasi dependensi & npm scripts
```

---

## 👥 7. Anggota Tim Pengembang

Proyek ini dikembangkan oleh mahasiswa Program Studi S1 Ilmu Komputer, Departemen Ilmu Komputer dan Elektronika, FMIPA Universitas Gadjah Mada:

* **Aloysius Pijar Hutama Indrianto** — NIM: 24/534591/PA/22675
* **Indratanaya Budiman** — NIM: 24/534784/PA/22683

---

## 📄 8. Lisensi

Proyek ini dilisensikan di bawah lisensi terbuka [MIT License](LICENSE).
