export const API = process.env.NEXT_PUBLIC_API_URL || 'https://hulhup-api.vercel.app';
export const ORIGIN = 'https://hulhup.my.id';

export type Post = {
  id: number; desc: string; secs: number; url: string; created: number; likes: number; plays: number; views: number; comments: number;
  owner: string; owner_name: string; owner_avatar: string | null; owner_verified?: boolean; files: { url: string; secs: number }[];
  bgm: boolean; text: string | null; long: boolean; ai?: boolean;
};
export type User = {
  username: string; name: string; bio?: string; avatar: string | null; cover?: string | null; verified?: boolean;
  followers?: number; following?: number; posts?: number;
};
export type Comment = { id: number; text?: string; body?: string; owner: string; owner_name: string; owner_avatar: string | null; created: number; likes: number; replies?: Comment[] };

/** Ambil data publik di server (tanpa akun). Gagal => null, halaman tetap tampil. */
export async function pub<T>(path: string, revalidate = 60): Promise<T | null> {
  try {
    const r = await fetch(API + path, { headers: { accept: 'application/json' }, next: { revalidate } });
    return r.ok ? ((await r.json()) as T) : null;
  } catch { return null; }
}
export const media = (p?: string | null) => (p ? (p.startsWith('/') ? API + p : p) : '');
