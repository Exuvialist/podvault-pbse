# PodVault — Panduan Deployment & Konfigurasi Keamanan

PodVault adalah *Single Page Application* (SPA) berbasis web statis tanpa backend (*zero-backend*). Seluruh proses komputasi kriptografi dilakukan di peramban pengguna (*client-side*).

Dokumen ini memandu deployment produksi yang aman dan konfigurasi server penyedia Solid Pod.

---

## 1. Membangun Aplikasi (*Build*)

Pastikan Node.js (≥ 18) dan npm terpasang di sistem:

```bash
# 1. Pasang dependensi
npm install

# 2. Jalankan pengujian unit & verifikasi tipe
npm run typecheck
npm test

# 3. Bangun bundel produksi
npm run build
```

Hasil build akan tersimpan di direktori `dist/` yang siap disajikan oleh web server statis manapun.

---

## 2. Header Keamanan Wajib (Production Security Headers)

Karena PodVault menangani dokumen berklasifikasi rahasia, web server wajib mengirimkan header proteksi tingkat tinggi:

### 2.1 Content Security Policy (CSP)
Membatasi sumber eksekusi script dan mencegah serangan XSS (*Cross-Site Scripting*):

```http
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https: http://localhost:*; worker-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
```

*Catatan: `connect-src` mengizinkan koneksi ke Solid Pod tujuan pengguna (HTTPS).*

### 2.2 Referrer Policy (Sangat Kritis)
Tautan berbagi dokumen (*share link*) meletakkan kunci enkripsi pada URL fragment (`#`). Standar browser tidak mengirim fragment ke server, namun untuk memastikan URL tidak bocor ke pihak ketiga melalui header referer:

```http
Referrer-Policy: no-referrer
```

### 2.3 Header Keamanan Pelengkap
```http
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
Cross-Origin-Opener-Policy: same-origin
```

---

## 3. Contoh Konfigurasi Web Server

### 3.1 Nginx (`nginx.conf`)

```nginx
server {
    listen 443 ssl http2;
    server_name vault.example.com;

    ssl_certificate /etc/letsencrypt/live/vault.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/vault.example.com/privkey.pem;

    root /var/www/podvault/dist;
    index index.html;

    # Security Headers
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https:; worker-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" always;
    add_header Referrer-Policy "no-referrer" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()" always;

    # Single Page Application Fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### 3.2 Cloudflare Pages (`_headers`)
Letakkan file `public/_headers` atau buat di direktori `dist/_headers`:

```text
/*
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https:; worker-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
  Referrer-Policy: no-referrer
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
```

### 3.3 Vercel (`vercel.json`)
```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" },
        { "key": "Content-Security-Policy", "value": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https:; worker-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" },
        { "key": "Referrer-Policy", "value": "no-referrer" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=(), payment=()" }
      ]
    }
  ]
}
```

---

## 4. Konfigurasi Server Solid Pod (CORS)

Jika pengguna menghubungkan PodVault ke penyedia Solid Pod eksternal (seperti Community Solid Server - CSS), server Solid tersebut **wajib mengizinkan CORS** agar peramban dapat mengirim permintaan `GET`, `PUT`, `DELETE`:

### Pengaturan CSS (*Community Solid Server*):
Jalankan CSS dengan opsi CORS aktif:
```bash
npx @solid/community-server -c @css:config/file.json -f ./data --cors
```

Header yang harus dikembalikan oleh server Solid:
```http
Access-Control-Allow-Origin: * (atau domain spesifik PodVault)
Access-Control-Allow-Methods: GET, HEAD, OPTIONS, POST, PUT, DELETE, PATCH
Access-Control-Allow-Headers: Authorization, Content-Type, Accept, Slug, Link, If-Match
```

---

## 5. Checklist Verifikasi Pasca-Deployment

- [ ] Seluruh aset dimuat melalui HTTPS dengan sertifikat valid.
- [ ] Pemeriksaan di `https://securityheaders.com` menghasilkan nilai **A / A+**.
- [ ] Tidak ada script analitik atau telemetri pihak ketiga yang terpasang.
- [ ] Header `Referrer-Policy: no-referrer` aktif saat membuka tautan share.
- [ ] Pengujian unggah dan pratinjau dokumen di IndexedDB lokal berfungsi normal.
- [ ] Lembar pemulihan (Emergency Recovery Sheet) dapat dirender dan dicetak dengan layout A4 presisi.
