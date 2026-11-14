/** Dua mata mengintip dari balik tembok. Warna asli: mata putih di atas ungu, atau ungu bila bingkai dilepas. */
export default function Logo({ size = 36, tile = false, eyes = 'var(--brand)', pupil = '#fff', wall = 'var(--deep)', anim = false }: { size?: number; tile?: boolean; eyes?: string; pupil?: string; wall?: string; anim?: boolean }) {
  const cls = anim ? 'logo-anim' : undefined;
  return (
    <svg className={cls} width={size} height={size * 0.7} viewBox="0 0 72 50" role="img" aria-label="Hulhup" style={tile ? { background: 'var(--brand)', borderRadius: size * 0.26, padding: size * 0.12 } : undefined}>
      <style>{`.logo-anim .e{animation:peek 3.2s ease-in-out infinite}@keyframes peek{0%,8%{transform:translateY(14px)}18%,86%{transform:none}94%,100%{transform:translateY(14px)}}.logo-anim .p{animation:look 3.2s ease-in-out infinite}@keyframes look{0%,30%{transform:translateX(0)}45%{transform:translateX(3px)}65%{transform:translateX(-2px)}80%,100%{transform:translateX(1px)}}`}</style>
      <defs><clipPath id="c"><rect x="0" y="0" width="72" height="35" /></clipPath></defs>
      <g clipPath="url(#c)"><g className="e">
        <ellipse cx="22" cy="25" rx="12.5" ry="15" fill={eyes} /><ellipse cx="50" cy="25" rx="12.5" ry="15" fill={eyes} />
        <circle className="p" cx="25" cy="22" r="5.4" fill={pupil} /><circle className="p" cx="53" cy="22" r="5.4" fill={pupil} />
      </g></g>
      <rect x="4" y="35" width="64" height="15" rx="5.6" fill={wall} />
    </svg>
  );
}
