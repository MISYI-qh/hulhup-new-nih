// Deteksi tanda AI pada berkas dari metadata yang tertanam (cara yang sama dipakai platform besar):
//  - IPTC/XMP DigitalSourceType = trainedAlgorithmicMedia / compositeWithTrainedAlgorithmicMedia (juga ditulis Photoshop "Generative Fill", Google, dll),
//  - teks PNG pembuat gambar (Stable Diffusion/ComfyUI menulis parameter), field Software/EXIF, tag ID3/MP4 pembuat suara,
//  - Content Credentials (C2PA) HANYA bila isinya menyebut sumber AI. C2PA saja tidak cukup: kamera asli (Pixel, Leica, Sony) juga menulisnya.
// Hanya menandai yang MENGAKU AI lewat metadata; file yang metadatanya dihapus (screenshot, ekspor ulang) atau suara yang direkam ulang tidak terdeteksi.
// Kata dicocokkan sebagai kata utuh supaya "audio" tidak dikira "udio".
const IMG = [
  /trainedalgorithmicmedia/, /compositewithtrainedalgorithmicmedia/, /compositesynthetic/, /digitalsourcetype\/algorithmicmedia/, /synthid/, /made with google ai/,
  /\bmidjourney\b/, /\bdall[-·. ]?e\b/, /\bstable[ -]?diffusion\b/, /\bsdxl\b/, /\bcomfyui\b/, /\bautomatic1111\b/, /adobe firefly/, /\bleonardo\.ai\b/, /\bideogram\b/, /\bflux\.1\b/,
  /\bnano banana\b/, /\bgenerated (by|with) ai\b/, /\bai[- ]generated\b/, /\bgenerative ai\b/, /\bopenai\b.{0,40}\b(image|gpt-image|dall)/,
];
const AUD = [
  /trainedalgorithmicmedia/, /compositewithtrainedalgorithmicmedia/, /compositesynthetic/, /synthid/,
  /\belevenlabs\b/, /\beleven ?labs\b/, /\bsuno\b/, /\budio\b/, /\bsuno\.ai\b/, /\bmurf\.ai\b/, /\bplay\.ht\b/, /\bresemble\.ai\b/, /\bfish[ .-]?audio\b/, /\bcoqui\b/,
  /\bmicrosoft azure.{0,20}(tts|speech)\b/, /\bamazon polly\b/, /\bgoogle (cloud )?(tts|text-to-speech)\b/, /\bwavenet\b/, /\btext[- ]to[- ]speech\b/, /\bsynthesi[sz]ed (speech|voice)\b/,
  /\bgenerated (by|with) ai\b/, /\bai[- ]generated\b/, /\bvoice[ -]?clon/,
];
function scan(buf, res) {
  const n = buf.length, span = 262144;
  const s = (n <= span * 2 ? buf.toString('latin1') : buf.toString('latin1', 0, span) + '\n' + buf.toString('latin1', n - span)).toLowerCase();
  return res.some((r) => r.test(s));
}
export const aiImage = (buf) => scan(buf, IMG);
export const aiAudio = (buf) => scan(buf, AUD);

// ---- Deteksi dari ISI berkas lewat layanan pendeteksi (butuh kunci API di env AI_DETECT_KEY) ----
// Gambar: AI or Not  POST /v2/image/sync  (multipart "image") -> report.ai_generated.verdict = 'ai' | 'human' | 'unknown'.
// Audio : alamat dan nama kolom diatur lewat env karena berbeda per layanan: AI_DETECT_AUDIO_URL, AI_DETECT_AUDIO_FIELD (bawaan "audio").
// Gagal/lambat = dianggap tidak diketahui (tidak pernah menuduh), jadi hasil akhirnya tetap dari metadata.
const KEY = () => process.env.AI_DETECT_KEY || '';
const IMG_URL = () => process.env.AI_DETECT_IMAGE_URL || 'https://api.aiornot.com/v2/image/sync';

async function post(url, field, buf, mime, name) {
  const fd = new FormData();
  fd.append(field, new Blob([buf], { type: mime }), name);
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 9000);
  try {
    const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${KEY()}` }, body: fd, signal: ctl.signal });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; } finally { clearTimeout(t); }
}
/** Mencari verdict pada bentuk jawaban yang umum: {report:{ai_generated:{verdict}}} atau {verdict} atau {is_ai}. */
export function verdictOf(j) {
  if (!j || typeof j !== 'object') return null;
  const seen = [j, j.report, j.report && j.report.ai_generated, j.report && j.report.ai_voice, j.report && j.report.voice, j.report && j.report.music, j.result];
  for (const o of seen) {
    if (!o || typeof o !== 'object') continue;
    if (typeof o.verdict === 'string') return o.verdict === 'ai' ? true : o.verdict === 'human' ? false : null;
    if (typeof o.is_ai === 'boolean') return o.is_ai;
    if (o.ai && typeof o.ai.is_detected === 'boolean') return o.ai.is_detected;
  }
  return null;
}
export async function detectImage(buf, mime) {
  if (!KEY()) return null;
  return verdictOf(await post(IMG_URL(), 'image', buf, mime || 'image/jpeg', 'photo'));
}
export async function detectAudio(buf, mime) {
  const url = process.env.AI_DETECT_AUDIO_URL;
  if (!KEY() || !url) return null;
  return verdictOf(await post(url, process.env.AI_DETECT_AUDIO_FIELD || 'audio', buf, mime || 'audio/mpeg', 'voice'));
}
/** Hasil akhir: metadata mengaku AI, atau layanan pendeteksi memutuskan AI. */
export async function isAiImage(buf, mime) { return aiImage(buf) || (await detectImage(buf, mime)) === true; }
export async function isAiAudio(buf, mime) { return aiAudio(buf) || (await detectAudio(buf, mime)) === true; }
