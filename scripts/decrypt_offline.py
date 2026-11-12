#!/usr/bin/env python3
"""
PodVault - Standalone Offline Decryptor (Python CLI)
Mendekripsi dokumen PodVault tanpa memerlukan aplikasi web PodVault.

Standar Kriptografi:
- Algoritma: AES-GCM-256 (NIST SP 800-38D)
- Kunci Universal (Master Key): 32-byte (256-bit) Hexadecimal
- Model: Envelope Encryption (Master Key -> File Key -> Plaintext)

Cara Penggunaan:
  python decrypt_offline.py <MASTER_KEY_HEX> <FILE_ENCRYPTED.json> [OUTPUT_FILE]

Contoh:
  python decrypt_offline.py b43874bdda2c7bd7... sertifikat-tanah.pdf.encrypted.json sertifikat_hasil.pdf
"""

import sys
import json
import base64
import hashlib
from pathlib import Path

try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
except ImportError:
    print("[ERROR] Pustaka 'cryptography' belum terpasang.")
    print("Silakan pasang terlebih dahulu dengan menjalankan: pip install cryptography")
    sys.exit(1)


def from_b64u(s: str) -> bytes:
    """Mendekode string Base64URL menjadi bytes mentah."""
    norm = s.replace('-', '+').replace('_', '/')
    pad = len(norm) % 4
    if pad:
        norm += '=' * (4 - pad)
    return base64.b64decode(norm)


def decrypt_podvault_file(master_key_hex: str, json_path: str, output_path: str = None) -> str:
    # 1. Validasi Master Key Hex
    clean_hex = master_key_hex.strip()
    if len(clean_hex) != 64:
        raise ValueError(f"Panjang Master Key harus 64 karakter hex (256-bit). Panjang saat ini: {len(clean_hex)}")
    master_key = bytes.fromhex(clean_hex)

    # 2. Baca file JSON terenkripsi
    with open(json_path, 'r', encoding='utf-8') as f:
        record = json.load(f)

    file_name = record.get('name', 'dokumen_terdekripsi.pdf')
    expected_sha256 = record.get('sha256')
    wrapped_key_data = record.get('wrappedKey')
    cipher_data = record.get('cipher')

    if not wrapped_key_data or not cipher_data:
        raise ValueError("Format file JSON tidak valid. Atribut 'wrappedKey' atau 'cipher' tidak ditemukan.")

    print(f"[*] Membuka dokumen: {file_name}")
    print(f"[*] Ukuran data: {record.get('size', 0)} bytes")

    # 3. Dekripsi File Key (FK) menggunakan Kunci Universal (Master Key)
    aes_master = AESGCM(master_key)
    wk_iv = from_b64u(wrapped_key_data['iv'])
    wk_ct = from_b64u(wrapped_key_data['ct'])
    
    try:
        file_key = aes_master.decrypt(wk_iv, wk_ct, None)
    except Exception as e:
        raise PermissionError("Gagal membuka Kunci Berkas: Master Key salah atau data rusak.") from e

    print("[+] Kunci berkas (File Key) berhasil dibuka.")

    # 4. Dekripsi Ciphertext dokumen menggunakan File Key (FK)
    aes_file = AESGCM(file_key)
    cipher_iv = from_b64u(cipher_data['iv'])
    cipher_ct = from_b64u(cipher_data['ct'])
    
    try:
        plaintext = aes_file.decrypt(cipher_iv, cipher_ct, None)
    except Exception as e:
        raise ValueError("Gagal mendekripsi isi dokumen: Ciphertext rusak atau terkorupsi.") from e

    # 5. Verifikasi Integritas SHA-256
    digest = hashlib.sha256(plaintext).hexdigest()
    if expected_sha256 and digest.lower() != expected_sha256.lower():
        raise ValueError(f"Peringatan Integritas: Hash SHA-256 tidak cocok! (Hitung: {digest}, Harapan: {expected_sha256})")

    print(f"[+] Verifikasi integritas berhasil! SHA-256: {digest[:16]}...")

    # 6. Simpan hasil dekripsi
    if not output_path:
        output_path = f"decrypted_{file_name}"

    with open(output_path, 'wb') as out_f:
        out_f.write(plaintext)

    print(f"[SUCCESS] Dokumen asli berhasil disimpan ke: {output_path}")
    return output_path


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)

    mk_hex = sys.argv[1]
    input_file = sys.argv[2]
    out_file = sys.argv[3] if len(sys.argv) > 3 else None

    try:
        decrypt_podvault_file(mk_hex, input_file, out_file)
    except Exception as err:
        print(f"\n[ERROR] {err}")
        sys.exit(1)


if __name__ == '__main__':
    main()
