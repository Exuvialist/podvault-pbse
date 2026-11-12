export function getStandaloneDecryptorHtml(): string {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PodVault — Standalone Offline Decryptor</title>
  <style>
    :root {
      --bg: #0f172a;
      --card: #1e293b;
      --border: #334155;
      --text: #f8fafc;
      --muted: #94a3b8;
      --primary: #38bdf8;
      --primary-hover: #0ea5e9;
      --ok: #34d399;
      --err: #f87171;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.5;
      padding: 2rem 1rem;
      display: flex;
      justify-content: center;
    }
    .container {
      width: 100%;
      max-width: 640px;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }
    header {
      text-align: center;
      margin-bottom: 0.5rem;
    }
    h1 {
      font-size: 1.6rem;
      color: var(--primary);
      margin-bottom: 0.3rem;
    }
    p.subtitle {
      color: var(--muted);
      font-size: 0.9rem;
    }
    .badge {
      display: inline-block;
      background: #0369a1;
      color: #fff;
      font-size: 0.75rem;
      padding: 0.15rem 0.5rem;
      border-radius: 9999px;
      font-weight: 600;
      margin-top: 0.4rem;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 0.75rem;
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }
    label {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--text);
    }
    .hint {
      font-size: 0.75rem;
      color: var(--muted);
    }
    input[type="text"], input[type="file"] {
      width: 100%;
      background: #0b1120;
      border: 1px solid var(--border);
      color: var(--text);
      padding: 0.65rem 0.8rem;
      border-radius: 0.5rem;
      font-size: 0.85rem;
      outline: none;
    }
    input[type="text"]:focus {
      border-color: var(--primary);
    }
    .mono {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    button {
      background: var(--primary);
      color: #0b1120;
      font-weight: 600;
      border: none;
      border-radius: 0.5rem;
      padding: 0.75rem 1rem;
      font-size: 0.95rem;
      cursor: pointer;
      transition: background 0.2s;
    }
    button:hover {
      background: var(--primary-hover);
    }
    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .status-box {
      border-radius: 0.5rem;
      padding: 1rem;
      font-size: 0.85rem;
      display: none;
    }
    .status-box.ok {
      display: block;
      background: rgba(52, 211, 153, 0.1);
      border: 1px solid var(--ok);
      color: var(--ok);
    }
    .status-box.err {
      display: block;
      background: rgba(248, 113, 113, 0.1);
      border: 1px solid var(--err);
      color: var(--err);
    }
    .download-area {
      margin-top: 0.5rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .download-btn {
      display: inline-block;
      text-align: center;
      background: var(--ok);
      color: #0b1120;
      text-decoration: none;
      font-weight: 600;
      padding: 0.7rem;
      border-radius: 0.5rem;
      font-size: 0.9rem;
    }
    .download-btn:hover {
      filter: brightness(1.1);
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>PodVault Offline Decryptor</h1>
      <p class="subtitle">Alat Mandiri Bebas Vendor Lock-in (100% Berjalan Lokal Tanpa Internet)</p>
      <span class="badge">Standar Terbuka AES-GCM-256 (NIST)</span>
    </header>

    <div class="card">
      <div class="field">
        <label for="masterKey">1. Kunci Universal (Master Key)</label>
        <input type="text" id="masterKey" class="mono" placeholder="Tempel 64-karakter Hex atau Base64Url Master Key..." spellcheck="false" autocomplete="off">
        <span class="hint">Dapat diperoleh dari menu Pengaturan PodVault atau Emergency Recovery Sheet Anda.</span>
      </div>

      <div class="field">
        <label for="fileInput">2. Pilih Berkas Terenkripsi (.json)</label>
        <input type="file" id="fileInput" accept=".json">
        <span class="hint">Berkas ciphertext (.json) yang diunduh dari Solid Pod atau antarmuka PodVault.</span>
      </div>

      <button id="decryptBtn" type="button">Dekripsi Dokumen Asli</button>

      <div id="statusBox" class="status-box"></div>
    </div>
  </div>

  <script>
    function fromB64u(s) {
      const norm = s.replace(/-/g, '+').replace(/_/g, '/');
      const pad = norm.length % 4 === 0 ? '' : '='.repeat(4 - (norm.length % 4));
      const bin = atob(norm + pad);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    }

    function hexToBytes(hex) {
      hex = hex.trim();
      if (hex.length % 2 !== 0) throw new Error('Panjang hex harus genap');
      const bytes = new Uint8Array(hex.length / 2);
      for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
      }
      return bytes;
    }

    async function sha256Hex(buf) {
      const d = await crypto.subtle.digest('SHA-256', buf);
      return Array.from(new Uint8Array(d)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    const masterKeyInput = document.getElementById('masterKey');
    const fileInput = document.getElementById('fileInput');
    const decryptBtn = document.getElementById('decryptBtn');
    const statusBox = document.getElementById('statusBox');

    decryptBtn.addEventListener('click', async () => {
      statusBox.className = 'status-box';
      statusBox.innerHTML = '';

      const keyStr = masterKeyInput.value.trim();
      if (!keyStr) {
        showError('Masukkan Kunci Universal (Master Key) terlebih dahulu.');
        return;
      }

      if (!fileInput.files || fileInput.files.length === 0) {
        showError('Pilih berkas terenkripsi (.json) terlebih dahulu.');
        return;
      }

      let masterKeyRaw;
      try {
        if (/^[0-9a-fA-F]{64}$/.test(keyStr)) {
          masterKeyRaw = hexToBytes(keyStr);
        } else {
          masterKeyRaw = fromB64u(keyStr);
        }
        if (masterKeyRaw.length !== 32) {
          throw new Error('Kunci harus berukuran 32 byte (256 bit).');
        }
      } catch (err) {
        showError('Format Master Key tidak valid: ' + err.message);
        return;
      }

      const file = fileInput.files[0];
      const reader = new FileReader();

      reader.onload = async (e) => {
        try {
          const record = JSON.parse(e.target.result);
          if (!record.wrappedKey || !record.cipher) {
            throw new Error('Struktur file JSON tidak valid. Atribut wrappedKey atau cipher tidak ditemukan.');
          }

          // 1. Import Master Key
          const masterKey = await crypto.subtle.importKey(
            'raw',
            masterKeyRaw,
            { name: 'AES-GCM' },
            false,
            ['decrypt']
          );

          // 2. Unwrap File Key (FK)
          const wkIv = fromB64u(record.wrappedKey.iv);
          const wkCt = fromB64u(record.wrappedKey.ct);
          let fkRaw;
          try {
            fkRaw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: wkIv }, masterKey, wkCt);
          } catch {
            throw new Error('Gagal membuka Kunci Berkas: Kunci Universal (Master Key) salah atau data terkorupsi.');
          }

          // 3. Import File Key
          const fileKey = await crypto.subtle.importKey(
            'raw',
            fkRaw,
            { name: 'AES-GCM' },
            false,
            ['decrypt']
          );

          // 4. Decrypt Plaintext
          const cipherIv = fromB64u(record.cipher.iv);
          const cipherCt = fromB64u(record.cipher.ct);
          let plaintext;
          try {
            plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: cipherIv }, fileKey, cipherCt);
          } catch {
            throw new Error('Gagal mendekripsi isi berkas: Data ciphertext rusak.');
          }

          // 5. Verify Integrity
          const digest = await sha256Hex(plaintext);
          if (record.sha256 && digest.toLowerCase() !== record.sha256.toLowerCase()) {
            throw new Error('Verifikasi integritas gagal: Hash SHA-256 tidak cocok!');
          }

          // 6. Siapkan Unduhan
          const blob = new Blob([plaintext], { type: record.mime || 'application/octet-stream' });
          const url = URL.createObjectURL(blob);
          const downloadName = record.name || 'dokumen_terdekripsi.pdf';

          statusBox.className = 'status-box ok';
          statusBox.innerHTML = \`
            <strong>✔ Dekripsi Berhasil!</strong><br>
            Nama Dokumen: <code>\${downloadName}</code><br>
            Ukuran: <strong>\${(blob.size / 1024).toFixed(1)} KB</strong><br>
            Integritas SHA-256: <code>\${digest.slice(0, 16)}...</code> (Valid)<br>
            <div class="download-area">
              <a href="\${url}" download="\${downloadName}" class="download-btn">Unduh Dokumen Asli (\${downloadName})</a>
            </div>
          \`;
        } catch (err) {
          showError(err.message);
        }
      };

      reader.onerror = () => showError('Gagal membaca file dari disk.');
      reader.readAsText(file);
    });

    function showError(msg) {
      statusBox.className = 'status-box err';
      statusBox.innerHTML = '<strong>❌ Terjadi Kesalahan:</strong><br>' + msg;
    }
  </script>
</body>
</html>`;
}
