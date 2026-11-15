import { ICONS } from '@/lib/icons';
export function Icon({ n, size = 24, color, style }: { n: string; size?: number; color?: string; style?: React.CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={color || 'currentColor'} aria-hidden="true" style={{ flex: 'none', ...style }} dangerouslySetInnerHTML={{ __html: ICONS[n] || '' }} />;
}

export type HK = 'sorot' | 'comment' | 'hups' | 'acak' | 'save' | 'share' | 'add';
/** Ikon buatan sendiri (terjemahan _HPainter): garis tipis berujung bulat. */
export function HIcon({ k, filled, size = 24, color = 'currentColor', burst = 1 }: { k: HK; filled?: boolean; size?: number; color?: string; burst?: number }) {
  const st = { stroke: color, strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  const fl = { fill: color, stroke: 'none' };
  const L = (x1: number, y1: number, x2: number, y2: number, o: any = st) => <line x1={x1} y1={y1} x2={x2} y2={y2} {...o} />;
  const t = Math.max(0, Math.min(1, burst));
  const lerp = (a: number, b: number) => a + (b - a) * t;
  let body: React.ReactNode = null;
  switch (k) {
    case 'sorot': {
      const o = filled ? fl : st;
      body = <>
        <rect x="8.2" y="17.6" width="7.6" height="4.6" rx="1.8" {...o} />
        <path d="M8.9 15.8H15.1L19.2 7.4H4.8Z" {...o} />
        {filled ? <g stroke={color} strokeWidth="1.6" strokeLinecap="round">
          {L(12, 5.6, 12, lerp(5.6, 1.6), { stroke: color, strokeWidth: 1.6, strokeLinecap: 'round' })}
          {L(6.6, 5.4, lerp(6.6, 3.4), lerp(5.4, 2.2), { stroke: color, strokeWidth: 1.6, strokeLinecap: 'round' })}
          {L(17.4, 5.4, lerp(17.4, 20.6), lerp(5.4, 2.2), { stroke: color, strokeWidth: 1.6, strokeLinecap: 'round' })}
        </g> : null}
      </>; break;
    }
    case 'save': body = <path d="M7.5 3.6H16.5A1.5 1.5 0 0 1 18 5.1V20.4L12 16.2L6 20.4V5.1A1.5 1.5 0 0 1 7.5 3.6Z" {...(filled ? fl : st)} />; break;
    case 'comment': body = <><path d="M6.5 4H17.5A3.5 3.5 0 0 1 21 7.5V13A3.5 3.5 0 0 1 17.5 16.5H12.4L8 20.4V16.5H6.5A3.5 3.5 0 0 1 3 13V7.5A3.5 3.5 0 0 1 6.5 4Z" {...st} />{L(8, 9, 16, 9)}{L(8, 12.2, 13, 12.2)}</>; break;
    case 'hups': body = <><circle cx="5.6" cy="6" r="2.4" {...st} /><circle cx="5.6" cy="17.4" r="2.4" {...st} />{L(5.6, 8.4, 5.6, 15)}{L(10.6, 5, 20, 5)}{L(10.6, 8.4, 16.4, 8.4)}{L(10.6, 16.4, 20, 16.4)}{L(10.6, 19.8, 15.4, 19.8)}</>; break;
    case 'acak': body = <><path d="M3 7.5H6.4C10.4 7.5 11.4 16.5 15.4 16.5H19.4" {...st} /><path d="M3 16.5H6.4C10.4 16.5 11.4 7.5 15.4 7.5H19.4" {...st} /><path d="M17.2 14.3L19.4 16.5L17.2 18.7" {...st} /><path d="M17.2 5.3L19.4 7.5L17.2 9.7" {...st} /></>; break;
    case 'share': body = <><path d="M5 12.5V18A2 2 0 0 0 7 20H17A2 2 0 0 0 19 18V12.5" {...st} />{L(12, 15, 12, 4)}<path d="M8 8L12 4L16 8" {...st} /></>; break;
    case 'add': body = <>{L(12, 5, 12, 19)}{L(5, 12, 19, 12)}</>; break;
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ flex: 'none' }}>{body}</svg>;
}
