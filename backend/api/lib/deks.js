// DEKS: pemeriksa keaslian foto dan audio buatan Hulhup. Tanpa AI, tanpa layanan luar, tanpa biaya.
// Deks memeriksa ISI berkas (bukan deskripsi, bukan pengakuan pengguna) dengan tiga lapis bukti:
//   1. Metadata yang mengaku AI (IPTC/XMP, teks PNG, tag ID3, ...)  -> bukti kuat, langsung ditandai.
//   2. Ciri fisik isi: foto = derau sensor, ukuran khas generator, ada/tidaknya jejak kamera;
//      audio = hening digital (tidak ada derau ruangan), laju sampel khas mesin suara.
//   3. Penilaian gabungan: ditandai hanya bila beberapa ciri sekaligus cocok. Satu ciri saja tidak pernah cukup,
//      karena menuduh foto/suara asli sebagai AI lebih merusak daripada melewatkan satu yang AI.
// Batas jujur: ciri fisik hilang bila berkas dikompres ulang berat atau direkam ulang lewat mikrofon, dan generator baru
// terus belajar menirunya. Deks mencatat skor dan alasan supaya ambangnya bisa disetel dari data nyata.
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
import { aiImage, aiAudio, detectImage, detectAudio } from './aidetect.js';

export const DEKS_THRESHOLD = 0.8;

// ---------- foto ----------
const GEN_SIZES = new Set(['1024x1024', '1152x896', '896x1152', '1216x832', '832x1216', '1344x768', '768x1344', '1536x640', '640x1536', '1536x1024', '1024x1536', '1792x1024', '1024x1792', '1408x768', '768x1408', '2048x2048', '1536x1536', '1280x720', '720x1280', '1920x1080']);

/** Perkiraan derau (Immerkaer) per blok 16x16; kembalikan persentil ke-10 = derau di area paling datar. */
function noiseFloor(gray, w, h) {
  const sig = [];
  for (let by = 0; by + 16 <= h - 2; by += 16) {
    for (let bx = 0; bx + 16 <= w - 2; bx += 16) {
      let sum = 0, n = 0;
      for (let y = by + 1; y < by + 15; y++) for (let x = bx + 1; x < bx + 15; x++) {
        const i = y * w + x;
        const v = gray[i - w - 1] - 2 * gray[i - w] + gray[i - w + 1] - 2 * gray[i - 1] + 4 * gray[i] - 2 * gray[i + 1] + gray[i + w - 1] - 2 * gray[i + w] + gray[i + w + 1];
        sum += Math.abs(v); n++;
      }
      sig.push(Math.sqrt(Math.PI / 2) * sum / (6 * n));
    }
  }
  if (sig.length < 16) return null;
  sig.sort((a, b) => a - b);
  return sig[Math.floor(sig.length * 0.1)];
}

function hasCameraExif(buf) {
  const s = buf.toString('latin1', 0, Math.min(buf.length, 65536));
  return /Exif\0\0/.test(s) && /(Canon|NIKON|SONY|Apple|samsung|SAMSUNG|Google|Pixel|FUJIFILM|OLYMPUS|Panasonic|LEICA|Xiaomi|HUAWEI|OPPO|vivo|realme|motorola|iPhone)/.test(s);
}

export function analyzeImage(buf) {
  const reasons = [];
  let score = 0;
  let w = 0, h = 0, gray = null, isPng = false;
  try {
    if (buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG') {
      isPng = true;
      const p = PNG.sync.read(buf);
      w = p.width; h = p.height;
      gray = new Float32Array(w * h);
      for (let i = 0; i < w * h; i++) gray[i] = 0.299 * p.data[i * 4] + 0.587 * p.data[i * 4 + 1] + 0.114 * p.data[i * 4 + 2];
    } else if (buf[0] === 0xff && buf[1] === 0xd8) {
      const j = jpeg.decode(buf, { useTArray: true, maxMemoryUsageInMB: 256, maxResolutionInMP: 40 });
      w = j.width; h = j.height;
      gray = new Float32Array(w * h);
      for (let i = 0; i < w * h; i++) gray[i] = 0.299 * j.data[i * 4] + 0.587 * j.data[i * 4 + 1] + 0.114 * j.data[i * 4 + 2];
    }
  } catch { return { score: 0, reasons: ['tidak bisa dibaca'], ai: false }; }
  if (!gray) return { score: 0, reasons: ['format tidak dianalisis'], ai: false };
  const noise = noiseFloor(gray, w, h);
  const camera = hasCameraExif(buf);
  if (noise !== null && noise < 0.45) { score += 0.35; reasons.push(`derau sangat rendah (${noise.toFixed(2)})`); }
  if (GEN_SIZES.has(`${w}x${h}`) || (w % 64 === 0 && h % 64 === 0 && Math.min(w, h) >= 768)) { score += 0.25; reasons.push(`ukuran khas generator (${w}x${h})`); }
  if (!camera) { score += 0.2; reasons.push('tanpa jejak kamera'); }
  if (isPng && !/(pHYs|eXIf|iCCP|tIME)/.test(buf.toString('latin1', 0, Math.min(buf.length, 4096)))) { score += 0.1; reasons.push('PNG tanpa keterangan apa pun'); }
  if (camera) score = Math.min(score, 0.5); // ada jejak kamera: tidak pernah ditandai dari ciri fisik saja
  return { score: Math.round(score * 100) / 100, reasons, ai: score >= DEKS_THRESHOLD };
}

// ---------- audio ----------
function readWav(buf) {
  if (buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WAVE') return null;
  let o = 12, rate = 0, ch = 1, bits = 16, fmt = 1, data = null;
  while (o + 8 <= buf.length) {
    const id = buf.toString('latin1', o, o + 4), sz = buf.readUInt32LE(o + 4);
    if (id === 'fmt ') { fmt = buf.readUInt16LE(o + 8); ch = buf.readUInt16LE(o + 10); rate = buf.readUInt32LE(o + 12); bits = buf.readUInt16LE(o + 22); }
    if (id === 'data') { data = buf.subarray(o + 8, Math.min(buf.length, o + 8 + sz)); break; }
    o += 8 + sz + (sz & 1);
  }
  if (!data || fmt !== 1 || bits !== 16) return null;
  const n = Math.floor(data.length / 2 / ch), pcm = new Float32Array(n);
  for (let i = 0; i < n; i++) pcm[i] = data.readInt16LE(i * 2 * ch) / 32768;
  return { rate, pcm };
}

async function decodeAudio(buf) {
  const wav = readWav(buf);
  if (wav) return wav;
  const head = buf.toString('latin1', 0, 3);
  if (head === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) {
    const { MPEGDecoder } = await import('mpg123-decoder');
    const d = new MPEGDecoder();
    try {
      await d.ready;
      const r = d.decode(buf);
      if (!r.samplesDecoded) return null;
      return { rate: r.sampleRate, pcm: r.channelData[0] };
    } finally { d.free(); }
  }
  return null; // m4a/webm/ogg: hanya metadata (belum ada pengurai ringan)
}

export async function analyzeAudio(buf) {
  let dec = null;
  try { dec = await decodeAudio(buf); } catch { dec = null; }
  if (!dec || dec.pcm.length < dec.rate) return { score: 0, reasons: ['format tidak dianalisis'], ai: false };
  const { rate, pcm } = dec, frame = Math.floor(rate * 0.02), reasons = [];
  let score = 0, quiet = 0, digital = 0, total = 0, rms = [];
  for (let i = 0; i + frame <= pcm.length; i += frame) {
    let e = 0, z = 0;
    for (let k = 0; k < frame; k++) { const v = pcm[i + k]; e += v * v; if (Math.abs(v) < 1 / 65536) z++; }
    const r = Math.sqrt(e / frame); rms.push(r); total++;
    if (r < 1e-4) quiet++; // lebih sunyi dari ~-80 dBFS
    if (z / frame > 0.98) digital++;
  }
  const speechLevel = rms.slice().sort((a, b) => a - b)[Math.floor(rms.length * 0.9)];
  const lowest = rms.slice().sort((a, b) => a - b)[Math.floor(rms.length * 0.05)];
  if (speechLevel > 0.01 && digital / total >= 0.05) { score += 0.45; reasons.push(`hening digital murni (${Math.round(100 * digital / total)}% bingkai)`); }
  else if (speechLevel > 0.01 && lowest < 2e-4 && quiet / total >= 0.05) { score += 0.3; reasons.push('tanpa derau ruangan di sela bicara'); }
  if ([16000, 22050, 24000].includes(rate)) { score += 0.2; reasons.push(`laju sampel khas mesin suara (${rate} Hz)`); }
  return { score: Math.round(score * 100) / 100, reasons, ai: score >= 0.6 && reasons.length >= 2 };
}

// ---------- gabungan ----------
export async function isAiImage(buf, mime) {
  if (aiImage(buf)) return true;
  if (analyzeImage(buf).ai) return true;
  return (await detectImage(buf, mime)) === true; // layanan luar hanya bila kunci dipasang (opsional)
}
export async function isAiAudio(buf, mime) {
  if (aiAudio(buf)) return true;
  if ((await analyzeAudio(buf)).ai) return true;
  return (await detectAudio(buf, mime)) === true;
}
