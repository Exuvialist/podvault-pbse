# Model Keamanan PodVault (MVP)

Dokumen ini menjelaskan **apa yang benar-benar dijamin** oleh MVP dan apa yang belum. Kejujuran soal batas ini adalah bagian dari desain.

## 1. Hierarki Kunci

```
passphrase ──PBKDF2-SHA256 (600.000 iterasi, salt 16B)──► KEK (AES-GCM-256, non-extractable)
                                                             │
                                                             │ unwrap
                                                             ▼
MK  (32 byte acak, dibuat saat vault dibuat)  ◄── wrappedMasterKey (di config.json)
 │
 ├─ wrap ──► FK₁ (32 byte acak per file) ──► ciphertext file₁
 ├─ wrap ──► FK₂ ...
 └─ Shamir 3-dari-5 ──► 5 lembar kertas (Emergency Recovery Sheet)
```

| Objek | Disimpan di mana | Bentuk |
|---|---|---|
| KEK | **tidak pernah disimpan** | diturunkan ulang saat unlock |
| MK | `config.json` | dibungkus KEK (AES-GCM) |
| FK | `<file>.json` | dibungkus MK (AES-GCM) |
| Isi dokumen | `<file>.json` | ciphertext AES-GCM-256 |
| Share key | URL fragment / dibungkus passphrase | tidak pernah dikirim ke Pod |

Kenapa dua lapis (MK + FK)? Agar ganti passphrase cukup membungkus ulang **satu** kunci, bukan seluruh isi brankas. Dan agar satu file bisa dibagikan tanpa mengekspos MK.

## 2. Properti yang Dijamin

- **Zero-knowledge terhadap Pod.** Pod hanya menerima ciphertext, IV, dan metadata non-rahasia (nama file, kategori, ukuran, hash plaintext). Tidak ada kunci, tidak ada plaintext.
- **Integritas.** AES-GCM memberi autentikasi; SHA-256 plaintext diverifikasi saat dekripsi. Ciphertext yang diubah → `Error('integrity')`.
- **Passphrase salah tidak bisa dibedakan dari data rusak.** Keduanya gagal di tag GCM.
- **Kunci sesi di memori volatile.** MK di-`wipe()` saat lock/auto-lock. Tidak pernah ditulis ke localStorage/IndexedDB dalam bentuk mentah.
- **Watermark forensik** (WebID + IP + waktu UTC) dibakar ke piksel kanvas, sehingga tangkapan kanvas tetap membawa identitas pengakses.

## 3. Yang TIDAK Dijamin (dan mengapa)

| Klaim pemasaran | Realita di MVP | Rencana |
|---|---|---|
| "Passkeys / Secure Enclave" | MVP memakai passphrase → PBKDF2. WebAuthn PRF belum diaktifkan karena butuh authenticator nyata dan dukungan PRF lintas peramban belum merata. | Fase 2 |
| "Anti screenshot" | Tidak ada API peramban yang bisa memblokir kamera fisik atau screenshot OS. Yang bisa dilakukan: watermark, blur saat tab kehilangan fokus, blokir Ctrl+P/S, dan chunking render. | Watermark diperkuat di Fase 2 |
| "Tautan kedaluwarsa otomatis" | Kedaluwarsa dicek di klien; blob tetap ada sampai di-*prune*. Penerima yang sudah menyalin ciphertext tetap memilikinya. | ACP/WAC granular di Fase 3 |
| "Solid-OIDC + DPoP" | MVP memakai adapter Pod dengan Bearer token manual. DPoP belum diimplementasikan. | Fase 2 |
| "SPARQL injection" | MVP tidak mengirim SPARQL sama sekali — hanya PUT/GET path tetap. Permukaan serangan ini nol. | Tetap dihindari |

## 4. Vektor Ancaman & Mitigasi

1. **Pod dikompromikan** → penyerang hanya dapat ciphertext + nama file. Nama file sengaja tidak dienkripsi agar direktori bisa diindeks; ini trade-off yang didokumentasikan (bisa dienkripsi di iterasi berikut).
2. **XSS di aplikasi** → tidak ada `innerHTML` dengan data pengguna; render PDF ke kanvas, bukan iframe/object URL. CSP disarankan saat deploy (lihat `docs/DEPLOY.md`).
3. **Brute force passphrase** → PBKDF2 600k (OWASP 2023). Untuk passphrase lemah, ini tetap lambat; UI memaksa minimal 12 karakter.
4. **Kehilangan perangkat** → 5 lembar Shamir; 3 cukup untuk memulihkan MK, 2 tidak memberi informasi tentang MK (information-theoretic).
5. **Kebocoran link share** → ciphertext + kunci di URL fragment. Fragment tidak dikirim ke server, tapi bisa bocor lewat riwayat peramban/pesan. Karena itu opsi passphrase disediakan.
6. **Metadata leakage** → ukuran file, waktu unggah, dan kategori terlihat oleh Pod. Ini disengaja untuk fungsionalitas direktori.

## 5. Batasan Kriptografis yang Disadari

- Shamir diimplementasikan di GF(256) dengan polinomial 0x11B. Ini **bukan** konstanta waktu dan tidak tahan side-channel tingkat hardware; cukup untuk backup kertas.
- `randomBytes` memakai `crypto.getRandomValues` (CSPRNG platform).
- Tidak ada ratchet/forward secrecy: MK statis. Kompromi MK = seluruh arsip.
- Base64url dipakai untuk semua nilai biner di JSON agar stabil lintas bahasa.

## 6. Checklist Deployment

- [ ] Sajikan lewat HTTPS dengan HSTS.
- [ ] Kirim header CSP: `default-src 'self'; img-src 'self' data:; connect-src 'self' https://<pod-host>; worker-src 'self' blob:; object-src 'none'; frame-ancestors 'none'`.
- [ ] Jangan aktifkan analytics; aplikasi ini tidak boleh punya telemetri.
- [ ] `Referrer-Policy: no-referrer` agar URL share tidak bocor lewat Referer.
