// Contoh berkas buatan untuk uji Deks (tes otomatis dan /deks/selftest). Setiap contoh meniru cara alat aslinya menulis penanda.
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import { deflateSync } from 'node:zlib';

const crcT = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) { const b = Buffer.alloc(12 + data.length); b.writeUInt32BE(data.length, 0); b.write(type, 4, 'latin1'); data.copy(b, 8); b.writeUInt32BE(crc(b.subarray(4, 8 + data.length)), 8 + data.length); return b; }

let seed = 11; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
export function plainPng(w = 96, h = 96, alpha = 255) {
  const p = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4, v = 90 + ((x + y) % 60) + rnd() * 6; p.data[i] = v; p.data[i + 1] = v * 0.9; p.data[i + 2] = v * 0.8; p.data[i + 3] = alpha; }
  return PNG.sync.write(p);
}
/** Sisipkan chunk teks PNG tepat sebelum IDAT. kind: 'tEXt' | 'iTXt' | 'zTXt'. */
export function pngWithText(png, key, text, kind = 'tEXt') {
  let d;
  if (kind === 'tEXt') d = Buffer.concat([Buffer.from(key, 'latin1'), Buffer.from([0]), Buffer.from(text, 'latin1')]);
  else if (kind === 'zTXt') d = Buffer.concat([Buffer.from(key, 'latin1'), Buffer.from([0, 0]), deflateSync(Buffer.from(text, 'latin1'))]);
  else d = Buffer.concat([Buffer.from(key, 'latin1'), Buffer.from([0, 0, 0, 0, 0]), Buffer.from(text, 'utf8')]);
  const i = png.indexOf('IDAT') - 4;
  return Buffer.concat([png.subarray(0, i), chunk(kind, d), png.subarray(i)]);
}
export function pngWithCaBX(png, text) { const i = png.indexOf('IDAT') - 4; return Buffer.concat([png.subarray(0, i), chunk('caBX', Buffer.from(text, 'latin1')), png.subarray(i)]); }
/** PNG RGBA yang menyembunyikan "stealth_pnginfo" + teks di LSB alpha (kolom demi kolom, MSB dulu). */
export function pngStealth(text, magic = 'stealth_pnginfo') {
  const w = 64, h = 64, p = new PNG({ width: w, height: h });
  const payload = Buffer.from(text, 'utf8'), len = Buffer.alloc(4); len.writeUInt32BE(payload.length * 8);
  const bytes = Buffer.concat([Buffer.from(magic, 'latin1'), len, payload]);
  const bits = []; for (const b of bytes) for (let k = 7; k >= 0; k--) bits.push((b >> k) & 1);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; p.data[i] = 60 + x; p.data[i + 1] = 80 + y; p.data[i + 2] = 100; p.data[i + 3] = 254; }
  let n = 0;
  for (let x = 0; x < w && n < bits.length; x++) for (let y = 0; y < h && n < bits.length; y++) { const i = (y * w + x) * 4 + 3; p.data[i] = (p.data[i] & 0xfe) | bits[n++]; }
  return PNG.sync.write(p);
}
export function plainJpeg(w = 64, h = 64) {
  const data = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) { data[i * 4] = 120 + (i % w); data[i * 4 + 1] = 100; data[i * 4 + 2] = 80 + Math.floor(i / w); data[i * 4 + 3] = 255; }
  return Buffer.from(jpeg.encode({ data, width: w, height: h }, 85).data);
}
/** Sisipkan segmen APPn/COM setelah SOI. */
export function jpegSegment(jpg, marker, payload) { const len = Buffer.alloc(2); len.writeUInt16BE(payload.length + 2); return Buffer.concat([jpg.subarray(0, 2), Buffer.from([0xff, marker]), len, payload, jpg.subarray(2)]); }
export const jpegXmp = (jpg, xmp) => jpegSegment(jpg, 0xe1, Buffer.concat([Buffer.from('http://ns.adobe.com/xap/1.0/\0', 'latin1'), Buffer.from(xmp, 'utf8')]));
export const jpegC2pa = (jpg, text) => jpegSegment(jpg, 0xeb, Buffer.concat([Buffer.from('JP\0\0\0\0\0\0', 'latin1'), Buffer.from('jumb\0c2pa' + text, 'latin1')]));
export const jpegCom = (jpg, text) => jpegSegment(jpg, 0xfe, Buffer.from(text, 'utf8'));
/** EXIF minimal: daftar [tag, teks] ASCII di IFD0 (+ opsional tag numerik kamera lewat extra). */
export function jpegExif(jpg, ascii, extraCamera = false) {
  const entries = ascii.map(([tag, s]) => [tag, Buffer.from(s + '\0', 'latin1')]);
  const n = entries.length + (extraCamera ? 4 : 0);
  let off = 8 + 2 + n * 12 + 4;
  const ifd = Buffer.alloc(10 + n * 12 + 4), data = [];
  ifd.write('II', 0); ifd.writeUInt16LE(42, 2); ifd.writeUInt32LE(8, 4); ifd.writeUInt16LE(n, 8);
  let k = 0;
  for (const [tag, b] of entries) { const e = 10 + k * 12; ifd.writeUInt16LE(tag, e); ifd.writeUInt16LE(2, e + 2); ifd.writeUInt32LE(b.length, e + 4); ifd.writeUInt32LE(off, e + 8); data.push(b); off += b.length; k++; }
  if (extraCamera) for (const [tag, v] of [[0x8827, 200], [0x920a, 6], [0xa434, 1], [0x9003, 1]]) { const e = 10 + k * 12; ifd.writeUInt16LE(tag, e); ifd.writeUInt16LE(3, e + 2); ifd.writeUInt32LE(1, e + 4); ifd.writeUInt16LE(v, e + 8); k++; }
  return jpegSegment(jpg, 0xe1, Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), ifd, ...data]));
}

export function wav(extraChunks = Buffer.alloc(0), secs = 1, rate = 16000) {
  const n = rate * secs, pcm = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) pcm.writeInt16LE(Math.round(Math.sin(i / 20) * 8000 + (rnd() - 0.5) * 300), i * 2);
  const fmt = Buffer.alloc(24); fmt.write('fmt ', 0); fmt.writeUInt32LE(16, 4); fmt.writeUInt16LE(1, 8); fmt.writeUInt16LE(1, 10); fmt.writeUInt32LE(rate, 12); fmt.writeUInt32LE(rate * 2, 16); fmt.writeUInt16LE(2, 20); fmt.writeUInt16LE(16, 22);
  const dh = Buffer.alloc(8); dh.write('data', 0); dh.writeUInt32LE(pcm.length, 4);
  const body = Buffer.concat([Buffer.from('WAVE'), fmt, extraChunks, dh, pcm]);
  const h = Buffer.alloc(8); h.write('RIFF', 0); h.writeUInt32LE(body.length, 4);
  return Buffer.concat([h, body]);
}
export function wavInfo(pairs) {
  const subs = Buffer.concat(pairs.map(([k, v]) => { const b = Buffer.from(v + '\0'); const h = Buffer.alloc(8); h.write(k, 0); h.writeUInt32LE(b.length, 4); return Buffer.concat([h, b, b.length & 1 ? Buffer.from([0]) : Buffer.alloc(0)]); }));
  const list = Buffer.concat([Buffer.from('INFO'), subs]);
  const h = Buffer.alloc(8); h.write('LIST', 0); h.writeUInt32LE(list.length, 4);
  return wav(Buffer.concat([h, list]));
}
const syncsafe = (n) => Buffer.from([(n >> 21) & 127, (n >> 14) & 127, (n >> 7) & 127, n & 127]);
/** MP3 dengan ID3v2.3. frames: [[id, Buffer isi]]. */
export function mp3WithId3(frames) {
  const fr = Buffer.concat(frames.map(([id, d]) => { const h = Buffer.alloc(10); h.write(id, 0); h.writeUInt32BE(d.length, 4); return Buffer.concat([h, d]); }));
  const hd = Buffer.concat([Buffer.from('ID3'), Buffer.from([3, 0, 0]), syncsafe(fr.length)]);
  const frame = Buffer.alloc(417); frame[0] = 0xff; frame[1] = 0xfb; frame[2] = 0x90; frame[3] = 0x00;
  return Buffer.concat([hd, fr, frame, frame]);
}
export const id3Text = (s) => Buffer.concat([Buffer.from([0]), Buffer.from(s, 'latin1')]);
export const id3Txxx = (desc, val) => Buffer.concat([Buffer.from([0]), Buffer.from(desc + '\0' + val, 'latin1')]);
function box(type, ...kids) { const d = Buffer.concat(kids), h = Buffer.alloc(8); h.writeUInt32BE(8 + d.length, 0); h.write(type, 4, 'latin1'); return Buffer.concat([h, d]); }
/** M4A dengan tag ilst: items [[nama 4 huruf (boleh ©xxx), teks]] */
export function m4aWithTags(items) {
  const ilst = box('ilst', ...items.map(([k, v]) => { const dt = Buffer.concat([Buffer.alloc(8), Buffer.from(v, 'utf8')]); dt.writeUInt32BE(1, 0); const b = box('data', dt); const h = Buffer.alloc(8); h.writeUInt32BE(8 + b.length, 0); h.write(k, 4, 'latin1'); return Buffer.concat([h, b]); }));
  const meta = box('meta', Buffer.alloc(4), ilst);
  const ftyp = box('ftyp', Buffer.from('M4A \0\0\0\0M4A mp42isom', 'latin1'));
  return Buffer.concat([ftyp, box('moov', box('udta', meta)), box('mdat', Buffer.alloc(64))]);
}
export function oggOpusWithTags(vendor, comments) {
  const tags = Buffer.concat([Buffer.from('OpusTags'), (() => { const b = Buffer.alloc(4); b.writeUInt32LE(vendor.length); return b; })(), Buffer.from(vendor), (() => { const b = Buffer.alloc(4); b.writeUInt32LE(comments.length); return b; })(), ...comments.map((c) => { const b = Buffer.alloc(4); b.writeUInt32LE(c.length); return Buffer.concat([b, Buffer.from(c)]); })]);
  return Buffer.concat([Buffer.from('OggS\0\x02'), Buffer.alloc(20), Buffer.from('OpusHead\x01\x01', 'latin1'), Buffer.alloc(10), Buffer.from('OggS\0\0'), Buffer.alloc(20), tags, Buffer.alloc(32)]);
}

export const IPTC_NS = 'xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/"';
export const xmpDst = (name) => `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description ${IPTC_NS} Iptc4xmpExt:DigitalSourceType="http://cv.iptc.org/newscodes/digitalsourcetype/${name}"/></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;
