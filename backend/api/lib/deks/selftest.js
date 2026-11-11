// Uji mandiri Deks: contoh buatan yang meniru penanda alat asli; dipakai tes otomatis dan GET /deks/selftest (bukti kode jalan di server).
import { deksImage, deksAudio, DEKS_VERSION } from './index.js';
import * as S from './samples.js';

const camExif = (j) => S.jpegExif(j, [[0x010f, 'Canon'], [0x0110, 'Canon EOS 80D'], [0x0131, 'Adobe Lightroom']], true);
export const CASES = [
  // ---- foto: harus ditandai ----
  { name: 'A1111 parameters (PNG tEXt)', type: 'image', make: () => S.pngWithText(S.plainPng(), 'parameters', 'a cat\nNegative prompt: bad\nSteps: 20, Sampler: Euler a, CFG scale: 7, Seed: 1, Size: 512x512'), expect: ['made'] },
  { name: 'A1111 parameters (PNG iTXt)', type: 'image', make: () => S.pngWithText(S.plainPng(), 'parameters', 'x\nSteps: 30, Sampler: DPM++ 2M', 'iTXt'), expect: ['made'] },
  { name: 'ComfyUI workflow (PNG zTXt)', type: 'image', make: () => S.pngWithText(S.plainPng(), 'prompt', '{"3":{"class_type":"KSampler","inputs":{"seed":5,"steps":20}}}', 'zTXt'), expect: ['made'] },
  { name: 'NovelAI', type: 'image', make: () => S.pngWithText(S.plainPng(), 'Comment', '{"steps": 28, "sampler": "k_euler", "seed": 3}'), expect: ['made'] },
  { name: 'Midjourney (XMP Job ID di JPEG)', type: 'image', make: () => S.jpegXmp(S.plainJpeg(), '<x:xmpmeta><rdf:Description dc:description="Prompt --v 6 Job ID: 8f2a1c3e-aaaa-bbbb-cccc-1234567890ab"/></x:xmpmeta>'), expect: ['made'] },
  { name: 'IPTC trainedAlgorithmicMedia (XMP JPEG)', type: 'image', make: () => S.jpegXmp(S.plainJpeg(), S.xmpDst('trainedAlgorithmicMedia')), expect: ['made'] },
  { name: 'IPTC compositeWithTrainedAlgorithmicMedia (diedit AI)', type: 'image', make: () => S.jpegXmp(S.plainJpeg(), S.xmpDst('compositeWithTrainedAlgorithmicMedia')), expect: ['edited'] },
  { name: 'C2PA JUMBF di JPEG (trainedAlgorithmicMedia)', type: 'image', make: () => S.jpegC2pa(S.plainJpeg(), '"digitalSourceType":"http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia"'), expect: ['made'] },
  { name: 'C2PA caBX di PNG (OpenAI)', type: 'image', make: () => S.pngWithCaBX(S.plainPng(), 'claim_generator OpenAI c2pa.created'), expect: ['made'] },
  { name: 'EXIF Software = Stable Diffusion', type: 'image', make: () => S.jpegExif(S.plainJpeg(), [[0x0131, 'Stable Diffusion XL']]), expect: ['made'] },
  { name: 'Komentar JPEG "AI generated"', type: 'image', make: () => S.jpegCom(S.plainJpeg(), 'AI generated image'), expect: ['made'] },
  { name: 'Sidecar PNG tanpa piksel (dari klien)', type: 'image', make: () => { const full = S.pngWithText(S.plainPng(), 'parameters', 'x\nSteps: 20, Sampler: Euler a'); const sig = full.subarray(0, 8); const out = [sig]; let o = 8; while (o < full.length) { const len = full.readUInt32BE(o); const t = full.toString('latin1', o + 4, o + 8); if (t !== 'IDAT') out.push(full.subarray(o, o + 12 + len)); o += 12 + len; } return Buffer.concat(out); }, expect: ['made'] },
  { name: 'Data tersembunyi PNG (stealth alpha)', type: 'image', make: () => S.pngStealth('{"Steps": 20}'), expect: ['made'] },
  // ---- foto: TIDAK boleh ditandai ----
  { name: 'PNG polos', type: 'image', make: () => S.plainPng(), expect: [''] },
  { name: 'JPEG polos', type: 'image', make: () => S.plainJpeg(), expect: [''] },
  { name: 'Foto kamera (EXIF utuh, Lightroom)', type: 'image', make: () => camExif(S.plainJpeg()), expect: [''] },
  { name: 'Kamera utuh + takarir menyebut midjourney (hanya kata bebas)', type: 'image', make: () => S.jpegExif(S.jpegExif(S.plainJpeg(), [[0x010f, 'SONY'], [0x0110, 'ILCE-7M3'], [0x010e, 'inspired by midjourney art']], true), [[0x0131, 'x']]), expect: [''] },
  { name: 'Takarir "bukan AI generated"', type: 'image', make: () => S.jpegCom(S.plainJpeg(), 'this is not AI generated'), expect: [''] },
  { name: 'XMP DigitalSourceType = digitalCapture', type: 'image', make: () => S.jpegXmp(S.plainJpeg(), S.xmpDst('digitalCapture')), expect: [''] },
  { name: 'XMP DigitalSourceType = algorithmicMedia (bukan model terlatih)', type: 'image', make: () => S.jpegXmp(S.plainJpeg(), S.xmpDst('algorithmicMedia')), expect: [''] },
  { name: 'C2PA kamera tanpa tanda AI', type: 'image', make: () => S.jpegC2pa(S.plainJpeg(), '"claim_generator":"Pixel Camera","digitalSourceType":"http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture"'), expect: [''] },
  { name: 'Berkas bukan gambar', type: 'image', make: () => Buffer.from('halo dunia, ini bukan gambar'), expect: [''] },
  // ---- audio: harus ditandai ----
  { name: 'MP3 ID3 TXXX Suno', type: 'audio', make: () => S.mp3WithId3([['TXXX', S.id3Txxx('comment', 'made with suno')]]), expect: ['made'] },
  { name: 'MP3 ID3 pencipta ElevenLabs', type: 'audio', make: () => S.mp3WithId3([['TPE1', S.id3Text('ElevenLabs')], ['TIT2', S.id3Text('suara')]]), expect: ['made'] },
  { name: 'WAV INFO ISFT Coqui TTS', type: 'audio', make: () => S.wavInfo([['ISFT', 'Coqui TTS 0.22']]), expect: ['made'] },
  { name: 'M4A tag ©too + deskripsi AI generated', type: 'audio', make: () => S.m4aWithTags([['\xa9too', 'Udio'], ['desc', 'AI generated music']]), expect: ['made'] },
  { name: 'Opus vendor/comment AI', type: 'audio', make: () => S.oggOpusWithTags('libopus', ['COMMENT=generated with AI']), expect: ['made'] },
  { name: 'WAV XMP/DigitalSourceType diedit AI', type: 'audio', make: () => S.wav(Buffer.concat([(() => { const x = Buffer.from(S.xmpDst('compositeWithTrainedAlgorithmicMedia')); const h = Buffer.alloc(8); h.write('_PMX', 0); h.writeUInt32LE(x.length, 4); return Buffer.concat([h, x, x.length & 1 ? Buffer.from([0]) : Buffer.alloc(0)]); })()])), expect: ['edited'] },
  // ---- audio: TIDAK boleh ditandai ----
  { name: 'WAV polos', type: 'audio', make: () => S.wav(), expect: [''] },
  { name: 'MP3 dengan tag biasa', type: 'audio', make: () => S.mp3WithId3([['TIT2', S.id3Text('Lagu Rindu')], ['TPE1', S.id3Text('Budi')]]), expect: [''] },
  { name: 'M4A rekaman ponsel (Lavf)', type: 'audio', make: () => S.m4aWithTags([['\xa9too', 'Lavf60.3.100']]), expect: [''] },
  { name: 'Kata "audio" tidak dikira "udio"', type: 'audio', make: () => S.mp3WithId3([['TIT2', S.id3Text('audio diary')], ['COMM', Buffer.concat([Buffer.from([0]), Buffer.from('eng'), Buffer.from('\0audio memo rekaman', 'latin1')])]]), expect: [''] },
  { name: 'Takarir "bukan AI generated" (audio)', type: 'audio', make: () => S.mp3WithId3([['COMM', Buffer.concat([Buffer.from([0]), Buffer.from('eng'), Buffer.from('\0not AI generated, my own voice', 'latin1')])]]), expect: [''] },
  { name: 'Berkas bukan audio', type: 'audio', make: () => Buffer.from('bukan audio sama sekali!!'), expect: [''] },
];

export function runSelfTest() {
  const out = [];
  for (const c of CASES) {
    let rep, err = null;
    try { rep = c.type === 'image' ? deksImage(c.make()) : deksAudio(c.make()); } catch (e) { err = String(e.message || e); }
    const got = rep ? rep.kind : 'error';
    out.push({ name: c.name, ok: !err && c.expect.includes(got), expect: c.expect[0], got, ...(err ? { err } : {}) });
  }
  return { version: DEKS_VERSION, ok: out.every((r) => r.ok), passed: out.filter((r) => r.ok).length, total: out.length, failed: out.filter((r) => !r.ok) };
}
