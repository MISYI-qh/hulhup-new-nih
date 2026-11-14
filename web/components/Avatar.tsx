import { media } from '@/lib/api';
export default function Avatar({ src, name, size = 44 }: { src?: string | null; name: string; size?: number }) {
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.4 }} aria-hidden="true">
      {src ? <img src={media(src)} alt="" width={size} height={size} loading="lazy" /> : (name || '?').trim().charAt(0).toUpperCase()}
    </span>
  );
}
