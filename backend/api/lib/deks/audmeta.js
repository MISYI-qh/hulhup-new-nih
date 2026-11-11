// Pengurai wadah audio: ID3 (MP3), MP4/M4A, RIFF/WAV, Ogg/Opus/Vorbis, FLAC, WebM. Hanya membaca keterangan tertanam (tag, pembuat berkas, C2PA/XMP);
// tidak mendekode suara. Bidang yang tak dikenali dipindai terbatas dan hanya pada awal berkas.
import { clean } from './text.js';

const MAXF = 200000;

export function audioFormat(b) {
  if (b.length < 12) return null;
  const h4 = b.toString('latin1', 0, 4);
  if (h4 === 'RIFF' && b.toString('latin1', 8, 12) === 'WAVE') return 'wav';
  if (h4.startsWith('ID3') || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return 'mp3';
  if (b.toString('latin1', 4, 8) === 'ftyp') return 'mp4';
  if (h4 === 'OggS') return 'ogg';
  if (h4 === 'fLaC') return 'flac';
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'webm';
  return null;
}

function decodeText(enc, buf) {
  if (enc === 1 || enc === 2) { let s = buf; if (s[0] === 0xff && s[1] === 0xfe) return s.subarray(2).toString('utf16le'); if (s[0] === 0xfe && s[1] === 0xff) return Buffer.from(s.subarray(2)).swap16().toString('utf16le'); return enc === 2 ? Buffer.from(s).swap16().toString('utf16le') : s.toString('utf16le'); }
  return enc === 3 ? buf.toString('utf8') : buf.toString('latin1');
}
const syncsafe = (b, o) => ((b[o] & 0x7f) << 21) | ((b[o + 1] & 0x7f) << 14) | ((b[o + 2] & 0x7f) << 7) | (b[o + 3] & 0x7f);

function id3(b, off, r) {
  // ID3v2 di awal berkas (atau di dalam chunk WAV)
  if (b.toString('latin1', off, off + 3) !== 'ID3') return 0;
  const ver = b[off + 3], flags = b[off + 5], size = syncsafe(b, off + 6);
  let o = off + 10;
  const end = Math.min(b.length, off + 10 + size);
  if (flags & 0x40 && ver >= 3) { const es = ver === 4 ? syncsafe(b, o) : b.readUInt32BE(o); o += es + (ver === 4 ? 0 : 4); }
  const idLen = ver === 2 ? 3 : 4, hLen = ver === 2 ? 6 : 10;
  while (o + hLen <= end) {
    const id = b.toString('latin1', o, o + idLen);
    if (!/^[A-Z0-9]{3,4}$/.test(id)) break;
    const sz = ver === 2 ? (b[o + 3] << 16) | (b[o + 4] << 8) | b[o + 5] : ver === 4 ? syncsafe(b, o + 4) : b.readUInt32BE(o + 4);
    const d = b.subarray(o + hLen, Math.min(end, o + hLen + sz));
    if (sz <= 0 || o + hLen + sz > end + 1) break;
    const nm = id.length === 3 ? ({ TT2: 'TIT2', TP1: 'TPE1', TAL: 'TALB', COM: 'COMM', TXX: 'TXXX', TSS: 'TSSE', TEN: 'TENC', TCR: 'TCOP' })[id] || id : id;
    try {
      if (nm === 'COMM' || nm === 'USLT') { const enc = d[0]; const body = decodeText(enc, d.subarray(4)); r.fields.push({ src: 'id3', key: nm, value: body.replace(/\0+/g, ' ').slice(0, MAXF) }); }
      else if (nm === 'TXXX') { const enc = d[0]; r.fields.push({ src: 'id3', key: 'TXXX', value: decodeText(enc, d.subarray(1)).replace(/\0+/g, ' = ').slice(0, MAXF) }); }
      else if (nm[0] === 'T') r.fields.push({ src: 'id3', key: nm, value: decodeText(d[0], d.subarray(1)).replace(/\0+/g, ' ').slice(0, MAXF) });
      else if (nm === 'PRIV') { const z = d.indexOf(0); r.fields.push({ src: 'id3', key: 'PRIV', value: clean(d.toString('latin1', 0, Math.min(z < 0 ? d.length : z + 200, 400))) }); }
      else if (nm === 'GEOB') { r.fields.push({ src: 'id3', key: 'GEOB', value: clean(d.toString('latin1', 0, 200)) }); if (/c2pa|jumbf/i.test(d.toString('latin1', 0, 200))) r.jumbf.push(d); }
      else if (nm === 'WXXX' || nm[0] === 'W') r.fields.push({ src: 'id3', key: nm, value: clean(d.toString('latin1', 0, 400)) });
    } catch { /* bingkai rusak */ }
    o += hLen + sz;
  }
  return 10 + size;
}

function mp4(b, r) {
  const walk = (start, end, depth, parent) => {
    let o = start;
    while (o + 8 <= end && depth < 8) {
      let sz = b.readUInt32BE(o);
      const t = b.toString('latin1', o + 4, o + 8);
      let hdr = 8;
      if (sz === 1) { if (o + 16 > end) break; sz = Number(b.readBigUInt64BE(o + 8)); hdr = 16; } else if (sz === 0) sz = end - o;
      if (sz < hdr || o + sz > end + 1) break;
      const bs = o + hdr, be = Math.min(end, o + sz);
      if (t === 'moov' || t === 'udta' || t === 'ilst' || t === 'trak' || t === 'mdia') walk(bs, be, depth + 1, t);
      else if (t === 'meta') walk(bs + 4, be, depth + 1, t);
      else if (parent === 'ilst' && be - bs > 16) {
        const d = b.subarray(bs, be), di = d.indexOf('data');
        if (di >= 0) r.fields.push({ src: 'mp4', key: t.replace('\xa9', '©'), value: d.toString('utf8', di + 12).replace(/\0+/g, ' ').slice(0, MAXF) });
      } else if (t === 'uuid' && be - bs >= 16) {
        const u = b.subarray(bs, bs + 16).toString('hex');
        if (u === 'd8fec3d61b0e483c92975828877ec481') r.jumbf.push(b.subarray(bs + 16, Math.min(be, bs + 16 + MAXF)));
        else if (u === 'be7acfcb97a942e89c71999491e3afac') r.xmp.push(b.toString('utf8', bs + 16, Math.min(be, bs + 16 + MAXF)));
      } else if (t === 'c2pa' || t === 'jumb') r.jumbf.push(b.subarray(bs, Math.min(be, bs + MAXF)));
      else if (t === 'mdhd' && !r.rate) { const v = b[bs]; r.rate = b.readUInt32BE(bs + (v === 1 ? 20 : 12)); }
      else if (t === 'ftyp') r.brand = b.toString('latin1', bs, bs + 4);
      o += sz;
    }
  };
  walk(0, b.length, 0, '');
}

function riff(b, r) {
  let o = 12;
  while (o + 8 <= b.length) {
    const id = b.toString('latin1', o, o + 4), sz = b.readUInt32LE(o + 4), d = b.subarray(o + 8, Math.min(b.length, o + 8 + sz));
    if (id === 'fmt ' && d.length >= 16) { r.rate = d.readUInt32LE(4); r.channels = d.readUInt16LE(2); r.bits = d.readUInt16LE(14); r.codec = 'pcm/' + d.readUInt16LE(0); }
    else if (id === 'LIST' && d.toString('latin1', 0, 4) === 'INFO') {
      let p = 4;
      while (p + 8 <= d.length) {
        const k = d.toString('latin1', p, p + 4), s = d.readUInt32LE(p + 4);
        r.fields.push({ src: 'wav-info', key: k, value: d.toString('utf8', p + 8, Math.min(d.length, p + 8 + s)).replace(/\0+/g, ' ').slice(0, 20000) });
        p += 8 + s + (s & 1);
      }
    } else if (id === 'bext') r.fields.push({ src: 'wav-bext', key: 'bext', value: clean(d.toString('latin1', 0, Math.min(d.length, 600))) });
    else if (id === 'iXML' || id === 'axml') r.fields.push({ src: 'wav-xml', key: id, value: clean(d.toString('utf8', 0, Math.min(d.length, MAXF))) });
    else if (id === '_PMX') r.xmp.push(d.toString('utf8', 0, Math.min(d.length, MAXF)));
    else if (id === 'c2pa') r.jumbf.push(d);
    else if (id === 'id3 ' || id === 'ID3 ') id3(d, 0, r);
    else if (id === 'data') r.dataBytes = sz;
    o += 8 + sz + (sz & 1);
  }
}

function vorbisComments(d, r, src) {
  // d diawali panjang vendor (uint32 LE)
  let p = 0;
  const vl = d.readUInt32LE(p); p += 4;
  r.fields.push({ src, key: 'vendor', value: d.toString('utf8', p, p + vl) }); p += vl;
  const n = Math.min(d.readUInt32LE(p), 500); p += 4;
  for (let i = 0; i < n && p + 4 <= d.length; i++) {
    const l = d.readUInt32LE(p); p += 4;
    if (l > MAXF || p + l > d.length) break;
    r.fields.push({ src, key: 'comment', value: d.toString('utf8', p, p + l) }); p += l;
  }
}

function ogg(b, r) {
  const head = b.subarray(0, Math.min(b.length, 131072));
  let i = head.indexOf('OpusTags');
  if (i >= 0) { try { vorbisComments(head.subarray(i + 8), r, 'opus'); } catch { /* */ } r.codec = 'opus'; return; }
  i = head.indexOf(Buffer.from([0x03, 0x76, 0x6f, 0x72, 0x62, 0x69, 0x73]));
  if (i >= 0) { try { vorbisComments(head.subarray(i + 7), r, 'vorbis'); } catch { /* */ } r.codec = 'vorbis'; }
}
function flac(b, r) {
  let o = 4;
  while (o + 4 <= b.length) {
    const hdr = b[o], t = hdr & 0x7f, len = b.readUIntBE(o + 1, 3), d = b.subarray(o + 4, o + 4 + len);
    if (t === 4) { try { vorbisComments(d, r, 'flac'); } catch { /* */ } }
    if (t === 0 && d.length >= 18) r.rate = (d[10] << 12) | (d[11] << 4) | (d[12] >> 4);
    if (hdr & 0x80) break;
    o += 4 + len;
  }
}
function webm(b, r) {
  // EBML: cari MuxingApp (0x4D80) dan WritingApp (0x5741) di awal berkas; lalu tag teks sederhana
  const h = b.subarray(0, Math.min(b.length, 8192));
  for (const [idb, key] of [[[0x4d, 0x80], 'MuxingApp'], [[0x57, 0x41], 'WritingApp']]) {
    const i = h.indexOf(Buffer.from(idb));
    if (i >= 0 && i + 3 < h.length) { const l = h[i + 2] & 0x7f; if (l > 0 && l < 80) r.fields.push({ src: 'webm', key, value: h.toString('utf8', i + 3, i + 3 + l) }); }
  }
}

/** Hasil: { format, fields:[{src,key,value}], xmp:[teks], jumbf:[Buffer], rate, channels, codec } */
export function parseAudio(buf) {
  const r = { format: audioFormat(buf), fields: [], xmp: [], jumbf: [] };
  try {
    if (r.format === 'mp3') {
      const skip = id3(buf, 0, r);
      if (buf.length > 128 && buf.toString('latin1', buf.length - 128, buf.length - 125) === 'TAG') {
        const t = buf.subarray(buf.length - 125);
        r.fields.push({ src: 'id3v1', key: 'tag', value: clean(t.toString('latin1', 0, 124)) });
      }
      for (let o = skip; o + 4 < Math.min(buf.length, skip + 4096); o++) {
        if (buf[o] === 0xff && (buf[o + 1] & 0xe0) === 0xe0) {
          const ver = (buf[o + 1] >> 3) & 3, sr = (buf[o + 2] >> 2) & 3;
          if (ver !== 1 && sr !== 3) { r.rate = [[11025, 12000, 8000], null, [22050, 24000, 16000], [44100, 48000, 32000]][ver][sr]; r.codec = 'mp3'; break; }
        }
      }
    } else if (r.format === 'wav') riff(buf, r);
    else if (r.format === 'mp4') mp4(buf, r);
    else if (r.format === 'ogg') ogg(buf, r);
    else if (r.format === 'flac') flac(buf, r);
    else if (r.format === 'webm') webm(buf, r);
  } catch { /* berkas rusak: pakai yang sudah terbaca */ }
  return r;
}
