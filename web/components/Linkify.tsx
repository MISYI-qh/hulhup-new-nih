const RE = /(https?:\/\/[^\s<]+|@[a-z0-9_]+)/gi;
/** Tautan dan tag @nama dibuat bisa diketuk. */
export default function Linkify({ text }: { text: string }) {
  const parts = text.split(RE);
  return <>{parts.map((s, i) => {
    if (/^https?:\/\//i.test(s)) { const u = s.replace(/[).,!?;:]+$/, ''); return <span key={i}><a href={u} rel="noopener noreferrer nofollow ugc" target="_blank" style={{ color: 'var(--brand)', fontWeight: 600 }}>{u}</a>{s.slice(u.length)}</span>; }
    if (/^@[a-z0-9_]+$/i.test(s)) return <a key={i} href={`/@${s.slice(1).toLowerCase()}`} style={{ color: 'var(--brand)', fontWeight: 700 }}>{s}</a>;
    return s;
  })}</>;
}
