import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

export class ApiErr extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}

export const now = () => Date.now();
export const sha = (s) => createHash('sha256').update(s).digest('hex');
export const token = () => randomBytes(32).toString('base64url');

const scryptP = (pw, salt) => new Promise((res, rej) => scrypt(pw, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (e, k) => (e ? rej(e) : res(k))));
export async function hashPw(pw) {
  const salt = randomBytes(16).toString('hex');
  return { salt, hash: (await scryptP(pw, salt)).toString('hex') };
}
export async function checkPw(pw, salt, hash) {
  const a = await scryptP(pw, salt);
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export const dayStr = (d) => d.toISOString().slice(0, 10);
export function okBirth(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && dayStr(d) === s && d.getTime() <= Date.now() && d.getUTCFullYear() >= 1900;
}
export function ageOf(s) {
  const b = new Date(s + 'T00:00:00Z'), n = new Date();
  let a = n.getUTCFullYear() - b.getUTCFullYear();
  if (n.getUTCMonth() < b.getUTCMonth() || (n.getUTCMonth() === b.getUTCMonth() && n.getUTCDate() < b.getUTCDate())) a--;
  return Math.max(0, a);
}

/** Jenis berkas dari isi (bukan dari ekstensi). */
export function imageMime(b) {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b.toString('latin1', 1, 4) === 'PNG') return 'image/png';
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  if (b.toString('latin1', 0, 3) === 'GIF') return 'image/gif';
  return null;
}
export function audioMime(b) {
  if (b.length < 12) return null;
  const h = b.toString('latin1', 0, 12);
  if (h.slice(4, 8) === 'ftyp') return 'audio/mp4';
  if (h.startsWith('ID3') || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return 'audio/mpeg';
  if (h.startsWith('OggS')) return 'audio/ogg';
  if (h.startsWith('RIFF') && h.slice(8, 12) === 'WAVE') return 'audio/wav';
  if (h.startsWith('fLaC')) return 'audio/flac';
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'audio/webm';
  return null;
}

export async function readBody(req, max) {
  const chunks = [];
  let n = 0;
  for await (const c of req) {
    n += c.length;
    if (n > max) throw new ApiErr('too_big', 413);
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}
