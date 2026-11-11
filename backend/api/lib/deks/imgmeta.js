// Pengurai wadah foto: JPEG, PNG, WebP. Mengeluarkan semua teks keterangan yang tertanam (EXIF, XMP, teks PNG, komentar JPEG)
// dan isi Content Credentials (C2PA/JUMBF) tanpa mendekode piksel. Semua pembacaan dibatasi dan tidak pernah melempar galat ke pemanggil.
import { inflateSync } from 'node:zlib';
import { clean } from './text.js';

const MAXTXT = 600000; // batas teks per bidang

export function imageFormat(b) {
  if (b.length > 12 && b[0] === 0xff && b[1] === 0xd8) return 'jpeg';
  if (b.length > 8 && b[0] === 0x89 && b.toString('latin1', 1, 4) === 'PNG') return 'png';
  if (b.length > 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}

// ---------- EXIF (TIFF) ----------
const EXIF_TAGS = { 0x010e: 'ImageDescription', 0x010f: 'Make', 0x0110: 'Model', 0x0131: 'Software', 0x013b: 'Artist', 0x8298: 'Copyright', 0x9286: 'UserComment', 0x927c: 'MakerNote',
  0x829a: 'ExposureTime', 0x829d: 'FNumber', 0x8827: 'ISO', 0x9003: 'DateTimeOriginal', 0x920a: 'FocalLength', 0xa434: 'LensModel', 0xa433: 'LensMake', 0x9c9c: 'XPComment', 0x9c9b: 'XPTitle', 0x9c9d: 'XPAuthor', 0x9c9f: 'XPSubject', 0xa420: 'ImageUniqueID', 0xa431: 'BodySerialNumber' };

export function parseExif(t) {
  const out = {};
  try {
    if (t.length < 12) return out;
    const le = t.toString('latin1', 0, 2) === 'II';
    if (!le && t.toString('latin1', 0, 2) !== 'MM') return out;
    const u16 = (o) => (le ? t.readUInt16LE(o) : t.readUInt16BE(o)), u32 = (o) => (le ? t.readUInt32LE(o) : t.readUInt32BE(o));
    const seen = new Set();
    const ifd = (off, depth) => {
      if (off < 8 || off + 2 > t.length || seen.has(off) || depth > 3) return;
      seen.add(off);
      const n = Math.min(u16(off), 400);
      for (let i = 0; i < n; i++) {
        const e = off + 2 + i * 12;
        if (e + 12 > t.length) break;
        const tag = u16(e), type = u16(e + 2), cnt = u32(e + 4);
        const size = ({ 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 })[type] || 1;
        const len = size * cnt, vo = len <= 4 ? e + 8 : u32(e + 8);
        if (tag === 0x8769 || tag === 0x8825 || tag === 0xa005) { if (tag === 0x8769) ifd(u32(e + 8), depth + 1); continue; }
        const name = EXIF_TAGS[tag];
        if (!name || vo + len > t.length || len > MAXTXT) continue;
        if (name === 'MakerNote') { out.MakerNote = len; continue; }
        if (type === 2) out[name] = t.toString('latin1', vo, vo + len).replace(/\0+$/, '');
        else if (name === 'UserComment') {
          const pre = t.toString('latin1', vo, vo + 8);
          const body = t.subarray(vo + 8, vo + len);
          out[name] = (pre.startsWith('UNICODE') ? (le ? body.toString('utf16le') : Buffer.from(body).swap16().toString('utf16le')) : body.toString('utf8')).replace(/\0+/g, '');
        } else if (name.startsWith('XP')) out[name] = t.subarray(vo, vo + len).toString('utf16le').replace(/\0+$/, '');
        else if (type === 5 && cnt >= 1) out[name] = u32(vo + 4) ? u32(vo) / u32(vo + 4) : 0;
        else if (type === 3 && cnt >= 1) out[name] = u16(vo);
        else if (type === 4 && cnt >= 1) out[name] = u32(vo);
      }
    };
    ifd(u32(4), 0);
  } catch { /* abaikan */ }
  return out;
}

// ---------- JPEG ----------
function parseJpeg(b, r) {
  let o = 2;
  const xmpExt = [];
  while (o + 4 <= b.length) {
    if (b[o] !== 0xff) { o++; continue; }
    const m = b[o + 1];
    if (m === 0xff) { o++; continue; }
    if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) { o += 2; continue; }
    if (m === 0xd9) break;
    const len = b.readUInt16BE(o + 2);
    if (len < 2) break;
    const seg = b.subarray(o + 4, Math.min(b.length, o + 2 + len));
    if (m === 0xe1 && seg.toString('latin1', 0, 6) === 'Exif\0\0') { r.exif = parseExif(seg.subarray(6)); r.hasExif = true; }
    else if (m === 0xe1 && seg.toString('latin1', 0, 29) === 'http://ns.adobe.com/xap/1.0/\0') r.xmp.push(seg.toString('utf8', 29).slice(0, MAXTXT));
    else if (m === 0xe1 && seg.toString('latin1', 0, 34) === 'http://ns.adobe.com/xmp/extension/') xmpExt.push(seg.toString('utf8', 75).slice(0, MAXTXT));
    else if (m === 0xeb) { r.jumbf.push(seg); }
    else if (m === 0xed) { r.fields.push({ src: 'photoshop', key: 'irb', value: clean(seg.toString('latin1', 0, Math.min(seg.length, 20000))) }); }
    else if (m === 0xfe) r.fields.push({ src: 'jpeg-com', key: 'comment', value: clean(seg.toString('utf8').slice(0, 20000)) });
    else if (m === 0xdb) { r.dqt = (r.dqt || 0) + 1; }
    else if (m >= 0xc0 && m <= 0xc2 && seg.length >= 6) { r.height = seg.readUInt16BE(1); r.width = seg.readUInt16BE(3); r.progressive = m === 0xc2; }
    if (m === 0xda) break;
    o += 2 + len;
  }
  if (xmpExt.length) r.xmp.push(xmpExt.join(''));
}

// ---------- PNG ----------
function parsePng(b, r) {
  let o = 8;
  while (o + 12 <= b.length) {
    const len = b.readUInt32BE(o), type = b.toString('latin1', o + 4, o + 8), d = b.subarray(o + 8, Math.min(b.length, o + 8 + len));
    if (len > b.length) break;
    if (type === 'IHDR' && d.length >= 13) { r.width = d.readUInt32BE(0); r.height = d.readUInt32BE(4); r.colorType = d[9]; r.bitDepth = d[8]; }
    else if (type === 'tEXt') { const i = d.indexOf(0); if (i > 0) r.fields.push({ src: 'png-text', key: d.toString('latin1', 0, i), value: d.toString('latin1', i + 1).slice(0, MAXTXT) }); }
    else if (type === 'zTXt') {
      const i = d.indexOf(0);
      if (i > 0) { try { r.fields.push({ src: 'png-text', key: d.toString('latin1', 0, i), value: inflateSync(d.subarray(i + 2), { maxOutputLength: MAXTXT }).toString('latin1') }); } catch { /* rusak */ } }
    } else if (type === 'iTXt') {
      const i = d.indexOf(0);
      if (i > 0 && d.length > i + 3) {
        const comp = d[i + 1];
        let p = d.indexOf(0, i + 3); if (p < 0) { o += 12 + len; continue; }
        p = d.indexOf(0, p + 1); if (p < 0) { o += 12 + len; continue; }
        let txt = d.subarray(p + 1);
        if (comp) { try { txt = inflateSync(txt, { maxOutputLength: MAXTXT }); } catch { txt = Buffer.alloc(0); } }
        const key = d.toString('latin1', 0, i), val = txt.toString('utf8').slice(0, MAXTXT);
        if (key === 'XML:com.adobe.xmp') r.xmp.push(val); else r.fields.push({ src: 'png-text', key, value: val });
      }
    } else if (type === 'eXIf') { r.exif = parseExif(d); r.hasExif = true; }
    else if (type === 'caBX') r.jumbf.push(d);
    else if (type === 'iCCP') r.icc = d.toString('latin1', 0, Math.max(0, d.indexOf(0)));
    else if (type === 'IDAT') r.sawIdat = true;
    else if (type === 'IEND') break;
    o += 12 + len;
  }
}

// ---------- WebP ----------
function parseWebp(b, r) {
  let o = 12;
  while (o + 8 <= b.length) {
    const id = b.toString('latin1', o, o + 4), len = b.readUInt32LE(o + 4), d = b.subarray(o + 8, Math.min(b.length, o + 8 + len));
    if (id === 'EXIF') { const s = d.toString('latin1', 0, 6) === 'Exif\0\0' ? d.subarray(6) : d; r.exif = parseExif(s); r.hasExif = true; }
    else if (id === 'XMP ') r.xmp.push(d.toString('utf8').slice(0, MAXTXT));
    else if (id === 'C2PA') r.jumbf.push(d);
    else if (id === 'VP8X' && d.length >= 10) { r.width = 1 + d.readUIntLE(4, 3); r.height = 1 + d.readUIntLE(7, 3); }
    else if (id === 'VP8 ' && d.length >= 10) { r.width = d.readUInt16LE(6) & 0x3fff; r.height = d.readUInt16LE(8) & 0x3fff; }
    else if (id === 'VP8L' && d.length >= 5) { const v = d.readUInt32LE(1); r.width = (v & 0x3fff) + 1; r.height = ((v >> 14) & 0x3fff) + 1; }
    o += 8 + len + (len & 1);
  }
}

/** Hasil: { format, width, height, fields:[{src,key,value}], xmp:[teks], jumbf:[Buffer], exif:{...}, hasExif } */
export function parseImage(buf) {
  const r = { format: imageFormat(buf), width: 0, height: 0, fields: [], xmp: [], jumbf: [], exif: {}, hasExif: false };
  try {
    if (r.format === 'jpeg') parseJpeg(buf, r);
    else if (r.format === 'png') parsePng(buf, r);
    else if (r.format === 'webp') parseWebp(buf, r);
  } catch { /* berkas rusak: pakai yang sudah terbaca */ }
  for (const [k, v] of Object.entries(r.exif)) if (typeof v === 'string' && v) r.fields.push({ src: 'exif', key: k, value: v });
  return r;
}

/** Jejak kamera nyata: merek+model dan beberapa data pemotretan (bukan sekadar satu tag). */
export function cameraEvidence(r) {
  const e = r.exif || {};
  let n = 0;
  if (e.Make && e.Model) n++;
  if (e.ExposureTime) n++;
  if (e.FNumber) n++;
  if (e.ISO) n++;
  if (e.FocalLength) n++;
  if (e.LensModel) n++;
  if (e.MakerNote) n++;
  if (e.DateTimeOriginal) n++;
  return n >= 4;
}
