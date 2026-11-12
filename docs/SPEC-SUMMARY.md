# PodVault — Ringkasan Spesifikasi Produk (MVP)

PodVault adalah brankas dokumen berdaulat mandiri (*self-sovereign document vault*): sebuah *Single Page Application* (SPA) berbasis web tanpa backend (*zero-backend*) yang mengenkripsi dokumen secara langsung di peramban pengguna (AES-GCM-256) dan menyimpan hanya **ciphertext** di Solid Pod atau penyimpanan lokal (IndexedDB).

---

## 1. Visi & Prinsip Desain

1. **Kedaulatan Data Mutlak (Self-Sovereignty):** Pengguna memegang kendali penuh atas kunci enkripsi dan lokasi penyimpanan. Tidak ada server terpusat yang menyimpan kunci atau memiliki akses dekripsi.
2. **Zero-Knowledge Architecture:** Penyedia penyimpanan (baik Solid Pod publik maupun privat) tidak pernah menerima plaintext, kunci master, atau passphrase.
3. **Penyajian Aman (Secure View-Only):** Dokumen sensitif tidak disajikan melalui Object URL atau iframe biasa, melainkan dirender halaman demi halaman ke HTML5 Canvas dengan watermark forensik yang dibakar langsung ke piksel.
4. **Pemulihan Tanpa Ketergantungan Server (Social/Physical Recovery):** Menggunakan *Shamir's Secret Sharing* (3-dari-5) sehingga arsip dapat dipulihkan melalui lembaran kertas fisik ber-QR code jika passphrase hilang.
5. **Standar Web Terbuka:** Mengadopsi ekosistem Solid (W3C), Web Crypto API standar, dan format semantik RDF (JSON-LD & Turtle).

---

## 2. Persona Pengguna & Kasus Penggunaan

- **Individu Berkesadaran Privasi Tinggi:** Ingin mengarsipkan dokumen krusial (KTP, paspor, sertifikat tanah, rekam medis, polis asuransi, surat wasiat) secara digital tanpa risiko kebocoran data di cloud sentralistik.
- **Berbagi Dokumen Sementara:** Berbagi salinan KTP atau hasil lab ke pihak ketiga (misalnya notaris, agen asuransi, atau dokter) dengan batas waktu kadaluwarsa (1 jam, 24 jam, atau 7 hari) dan watermark atribusi penerima.
- **Keluarga / Ahli Waris:** Mempersiapkan mitigasi bencana dengan membagikan 5 lembar pemulihan fisik terpisah kepada anggota keluarga atau safe deposit box; 3 lembar cukup untuk membuka kembali arsip.

---

## 3. Matriks Fitur MVP

| Modul | Kemampuan | Implementasi Teknis |
|---|---|---|
| **Kriptografi Klien** | Enkripsi end-to-end tanpa backend | AES-GCM-256, PBKDF2-SHA256 (600.000 iterasi, salt 16B CSPRNG). |
| **Hierarki Kunci** | Dua lapis KEK & MK | Mengganti passphrase cukup membungkus ulang Master Key tanpa mengenkripsi ulang seluruh berkas. |
| **Direktori Berkas** | Kategorisasi, pencarian, dan anti-duplikasi | 5 Kategori (Kependudukan, Kesehatan, Finansial, Kepemilikan Aset, Lainnya); deduplikasi via SHA-256 plaintext. |
| **Viewer Aman** | Pratinjau dokumen tanpa kebocoran file | PDF.js dirender ke `<canvas>` per halaman; pemblokiran seleksi teks, klik kanan, `Ctrl+P`/`Ctrl+S`, dan blur saat jendela blur. |
| **Watermark Forensik** | Atribusi kebocoran tangkapan layar | Lapisan ganda: dibakar ke piksel kanvas + overlay DOM interaktif. Memuat WebID/Penerima, status IP, dan timestamp UTC. |
| **Tautan Berbagi** | Pembagian dokumen aman berbatas waktu | Kunci enkripsi file diletakkan di URL fragment (`#`) atau dibungkus passphrase penerima; kadaluwarsa 1 jam, 24 jam, atau 7 hari. |
| **Lembar Pemulihan** | Emergency Recovery Sheet | Shamir Secret Sharing di GF(256) dengan skema 3-dari-5. Output siap cetak A4 dilengkapi QR Code dan kode teks terformat. |
| **Penyimpanan Ganda** | Offline-first & Solid Pod | Adapter lokal (IndexedDB) dan adapter Solid Pod (LDP REST PUT/GET/DELETE). |
| **Audit Trail** | Jejak audit tahan manipulasi (*tamper-evident*) | Rantai hash SHA-256 (`prevHash + '\|' + payload`), verifikasi integritas rantai di menu Pengaturan. |
| **Manifest Semantik** | Interoperabilitas metadata | Ekspor RDF berformat JSON-LD (`@context` Solid & schema.org) dan Turtle (`text/turtle`). |

---

## 4. Alur Kerja Utama Pengguna

### 4.1 Pembuatan & Pembukaan Brankas
1. Pengguna memasukkan WebID identitas (misal `https://demo.pod/profile#me`) dan passphrase (minimal 12 karakter).
2. Sistem membuat Master Key acak 32-byte, menurunkannya via PBKDF2-SHA256 menjadi KEK, membungkus Master Key, dan menyimpannya di `config.json`.
3. Kunci mentah hanya ada di memori RAM dan otomatis di-*wipe* saat dikunci atau *auto-lock* tercapai.

### 4.2 Unggah & Manajemen Dokumen
1. Pengguna memilih file PDF (misalnya dari `samples/sertifikat-tanah.pdf`) dan memilih kategori.
2. Klien memeriksa hash SHA-256 untuk memblokir duplikasi.
3. Klien menghasilkan File Key (FK) 32-byte acak per file, mengenkripsi ciphertext dokumen dengan FK, membungkus FK dengan MK, dan menyimpan catatan dokumen.

### 4.3 Pratinjau Dokumen Ber-Watermark
1. Pengguna memilih berkas; sistem mendekripsi FK menggunakan MK, lalu mendekripsi ciphertext dokumen.
2. PDF dimuat ke worker PDF.js lokal dan dirender ke elemen `<canvas>`.
3. Kanvas membakar watermark miring yang memuat: `WebID · IP · UTC Timestamp`.

### 4.4 Berbagi Sementara (Share Link)
1. Pengguna menentukan masa berlaku (misal 1 jam) dan memilih apakah tautan diamankan dengan passphrase tambahan.
2. Sistem mengekspor ciphertext file ke catatan share terisolasi.
3. Tautan publik dikirimkan. Penerima membuka URL tanpa memerlukan login ke brankas pemilik; dokumen didekripsi di sisi peramban penerima dengan watermark atribusi penerima.

### 4.5 Pemulihan Bencana (Recovery Sheet)
1. Di tab *Pemulihan*, pengguna menekan *Buat Recovery Sheet baru*.
2. Master Key dipecah menjadi 5 bagian (*shares*) dengan threshold 3.
3. Dokumen A4 dihasilkan untuk dicetak, memuat 5 QR code dan instruksi pemulihan.
4. Kapan saja, pengguna dapat memulihkan seluruh brankas di perangkat baru hanya dengan memasukkan 3 kode share.

---

## 5. Batasan & Kejujuran Ruang Lingkup MVP

- **Anti-Screenshot:** Peramban web secara fundamental tidak dapat mencegah perekaman layar OS atau kamera fisik eksternal. PodVault menerapkan mitigasi forensik atribusi (watermark).
- **Kedaluwarsa Tautan:** Pada MVP, verifikasi kadaluwarsa ditegakkan di sisi klien. Blob file share tetap ada di Pod sampai dihapus/di-prune secara manual.
- **Nama Berkas:** Nama berkas dan ukuran file disimpan tanpa enkripsi agar direktori dapat diindeks dan ditampilkan secara instan.
- **Autentikasi Solid:** Menggunakan manual Bearer Token pada MVP; Solid-OIDC dengan DPoP dialokasikan untuk Fase 2.

---

## 6. Rencana Fase Berikutnya

- **Fase 2:** Autentikasi Solid-OIDC dengan DPoP token otomatis, integrasi WebAuthn PRF (Passkeys / Secure Enclave hardware), dan pruning otomatis blob share kadaluwarsa.
- **Fase 3:** Access Control Policy (ACP / WAC) granular di Solid Pod dan federasi multi-pod.
