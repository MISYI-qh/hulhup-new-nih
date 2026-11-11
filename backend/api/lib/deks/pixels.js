// Dekode piksel untuk dua pemeriksa isi: data tersembunyi PNG dan watermark tak terlihat. Murni JS (jpeg-js, pngjs).
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
import { gunzipSync } from 'node:zlib';

export const MAX_PIXELS = 16e6;

export function decodePixels(buf, format, w, h) {
  if (w && h && w * h > MAX_PIXELS) return null;
  try {
    if (format === 'png') { const p = PNG.sync.read(buf); return { w: p.width, h: p.height, data: p.data, hasAlpha: true }; }
    if (format === 'jpeg') { const j = jpeg.decode(buf, { useTArray: true, maxMemoryUsageInMB: 400, maxResolutionInMP: 16 }); return { w: j.width, h: j.height, data: j.data, hasAlpha: false }; }
  } catch { /* tidak terbaca */ }
  return null;
}

// ---------- 1. Info PNG tersembunyi di bit terendah piksel (NovelAI "stealth", ekstensi stealth-pnginfo A1111) ----------
const STEALTH = ['stealth_pnginfo', 'stealth_pngcomp', 'stealth_rgbinfo', 'stealth_rgbcomp'];
/** Baca n bit dari LSB, menelusuri kolom demi kolom (x luar, y dalam), 8 bit per byte (MSB dulu). */
function lsbBytes(px, nbytes, mode) {
  const { w, h, data } = px, out = Buffer.alloc(nbytes);
  let bit = 0, x = 0, y = 0, acc = 0, nb = 0, o = 0, ch = 0;
  const total = nbytes * 8;
  while (bit < total) {
    if (x >= w) return null;
    const i = (y * w + x) * 4;
    const v = mode === 'alpha' ? data[i + 3] & 1 : data[i + ch] & 1;
    acc = (acc << 1) | v; nb++; bit++;
    if (nb === 8) { out[o++] = acc; acc = 0; nb = 0; }
    if (mode === 'rgb') { ch++; if (ch === 3) { ch = 0; y++; } } else y++;
    if (y >= h) { y = 0; x++; }
  }
  return out;
}
export function stealthInfo(px) {
  if (!px || px.w < 16 || px.h < 16) return null;
  for (const mode of ['alpha', 'rgb']) {
    const head = lsbBytes(px, 15, mode);
    if (!head) continue;
    const s = head.toString('latin1');
    if (STEALTH.includes(s) && (mode === 'alpha') === s.includes('png')) {
      let text = '';
      try {
        const lenBytes = lsbBytes(px, 19, mode);
        const n = lenBytes.readUInt32BE(15) / 8;
        if (n > 0 && n < 2e6) {
          const all = lsbBytes(px, 19 + n, mode);
          let p = all.subarray(19);
          if (s.endsWith('comp')) p = gunzipSync(p, { maxOutputLength: 2e6 });
          text = p.toString('utf8').slice(0, 4000);
        }
      } catch { /* hanya tanda tangan yang dipakai */ }
      return { signature: s, text };
    }
  }
  return null;
}

// ---------- 2. Watermark tak terlihat Stable Diffusion (paket invisible-watermark, metode dwtDct) ----------
// Skrip resmi Stable Diffusion v1/v2 dan pipeline diffusers SDXL menanam pesan tetap di kanal U (YUV) lewat DWT Haar + blok 4x4.
// Pesan 136/32/48 bit dibaca ulang dan dicocokkan persis; kebetulan cocok pada gambar biasa praktis mustahil.
const bitsOf = (s) => [...Buffer.from(s, 'utf8')].flatMap((c) => [...Array(8)].map((_, i) => (c >> (7 - i)) & 1));
const MESSAGES = [
  { name: 'Stable Diffusion v1', bits: bitsOf('StableDiffusionV1'), minOk: 128 },
  { name: 'Stable Diffusion v2', bits: bitsOf('SDV2'), minOk: 32 },
  { name: 'SDXL', bits: BigInt('0b101100111110110010010000011110111011000110011110').toString(2).split('').map(Number), minOk: 45 },
];

export function sdWatermark(px) {
  if (!px) return null;
  const { w, h, data } = px;
  const W = (w >> 2) << 2, H = (h >> 2) << 2;
  if (W < 256 || H < 256) return null;
  // kanal U (cv2 BGR2YUV): U = (B - Y) * 0.492 + 128
  const hw = W >> 1, hh = H >> 1;
  const ca = new Float32Array(hw * hh);
  const u = (x, y) => { const i = (y * w + x) * 4; const Y = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]; return Math.min(255, Math.max(0, Math.round((data[i + 2] - Y) * 0.492 + 128))); };
  for (let y = 0; y < hh; y++) for (let x = 0; x < hw; x++) ca[y * hw + x] = (u(2 * x, 2 * y) + u(2 * x + 1, 2 * y) + u(2 * x, 2 * y + 1) + u(2 * x + 1, 2 * y + 1)) / 2;
  const bs = 4, rows = Math.floor(hh / bs), cols = Math.floor(hw / bs), bits = new Uint8Array(rows * cols);
  let k = 0;
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    let best = -1, bv = 0;
    for (let p = 1; p < 16; p++) { const v = ca[(i * bs + (p >> 2)) * hw + j * bs + (p & 3)]; const a = Math.abs(v); if (a > best) { best = a; bv = v; } }
    bits[k++] = (Math.abs(bv) % 36) > 18 ? 1 : 0;
  }
  for (const m of MESSAGES) {
    const L = m.bits.length;
    if (bits.length / L < 6) continue;
    const sum = new Float64Array(L), cnt = new Float64Array(L);
    for (let n = 0; n < bits.length; n++) { sum[n % L] += bits[n]; cnt[n % L]++; }
    let ok = 0;
    for (let n = 0; n < L; n++) if (((sum[n] / cnt[n]) * 255 > 127 ? 1 : 0) === m.bits[n]) ok++;
    if (ok >= m.minOk) return { name: m.name, ok, of: L };
  }
  return null;
}
