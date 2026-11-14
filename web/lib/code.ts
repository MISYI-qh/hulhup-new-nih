// Kode pendek post: id angka <-> 7 karakter base62 acak (Feistel 4 putaran di 36 bit, bisa dibalik, tanpa DB).
const A = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const K = [0x2f4a7c, 0x91b3d5, 0x5e08a1, 0xc7392e];
const M = 0x3ffff; // 18 bit per sisi
const F = (x: number, k: number) => { let h = (Math.imul(x ^ k, 0x9e3779b1) >>> 0); h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b) >>> 0; h ^= h >>> 13; return h & M; };
export function enc(id: number): string {
  let l = Math.floor(id / (M + 1)) & M, r = id & M;
  for (const k of K) { const t = l ^ F(r, k); l = r; r = t; }
  let n = l * (M + 1) + r, s = '';
  for (let i = 0; i < 7; i++) { s = A[n % 62] + s; n = Math.floor(n / 62); }
  return s;
}
export function dec(code: string): number | null {
  if (!/^[0-9a-zA-Z]{7}$/.test(code)) return null;
  let n = 0; for (const ch of code) n = n * 62 + A.indexOf(ch);
  if (n >= (M + 1) * (M + 1)) return null;
  let l = Math.floor(n / (M + 1)), r = n % (M + 1);
  for (const k of [...K].reverse()) { const t = r ^ F(l, k); r = l; l = t; }
  return l * (M + 1) + r;
}
