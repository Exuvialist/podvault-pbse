#!/usr/bin/env node
/**
 * Generates small, valid multi-page PDFs used for demos and E2E tests.
 * Usage: node scripts/make-sample-pdf.mjs <out.pdf> <title> [page2-title]
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const [, , outPath = 'samples/dokumen-contoh.pdf', title = 'DOKUMEN CONTOH', subtitle = 'Halaman kedua'] =
  process.argv;

const esc = (s) => s.replace(/([\\()])/g, '\\$1');

function content(lines) {
  const body = lines
    .map(([text, size, y], i) => `BT /F1 ${size} Tf 64 ${y} Td (${esc(text)}) Tj ET`)
    .join('\n');
  return `q 0.95 0.95 0.95 rg 0 0 595 842 re f Q\nq 0.78 0.63 0.29 RG 4 w 48 48 499 746 re S Q\n${body}`;
}

const page1 = content([
  [title, 22, 760],
  ['Nomor: PV-DEMO-2026-0001', 11, 726],
  ['Dokumen ini dihasilkan otomatis untuk pengujian PodVault.', 11, 690],
  ['Seluruh isi dienkripsi AES-GCM-256 di peramban.', 11, 668],
  ['Tidak ada salinan plaintext yang dikirim ke server.', 11, 646],
  ['Tanda tangan: ____________________', 11, 120],
]);
const page2 = content([
  [subtitle, 22, 760],
  ['Lampiran A - Rincian', 13, 720],
  ['1. Objek: dokumen uji', 11, 688],
  ['2. Klasifikasi: rahasia', 11, 666],
  ['3. Pemilik: pemegang WebID', 11, 644],
  ['Watermark forensik akan tercetak di atas kanvas.', 11, 600],
]);

const objects = [];
const add = (body) => {
  objects.push(body);
  return objects.length; // 1-based object number
};

const catalog = add('<< /Type /Catalog /Pages 2 0 R >>');
const pages = add('<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>');
const pageObj1 = add(
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>',
);
const stream1 = add(`<< /Length ${Buffer.byteLength(page1)} >>\nstream\n${page1}\nendstream`);
const pageObj2 = add(
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>',
);
const stream2 = add(`<< /Length ${Buffer.byteLength(page2)} >>\nstream\n${page2}\nendstream`);
add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

if ([catalog, pages, pageObj1, stream1, pageObj2, stream2].some((n, i) => n !== i + 1)) {
  throw new Error('object numbering drifted');
}

let pdf = '%PDF-1.4\n';
const offsets = [0];
objects.forEach((body, i) => {
  offsets.push(Buffer.byteLength(pdf));
  pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
});
const xrefStart = Buffer.byteLength(pdf);
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
for (let i = 1; i <= objects.length; i++) {
  pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
}
pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, pdf, 'binary');
console.log(`wrote ${outPath} (${Buffer.byteLength(pdf)} bytes)`);
