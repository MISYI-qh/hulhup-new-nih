import Link from 'next/link';
import type { Post } from '@/lib/api';
import { ago, num } from '@/lib/format';
import Avatar from './Avatar';
import Player from './Player';
import Linkify from './Linkify';

export default function PostCard({ p, full = false }: { p: Post; full?: boolean }) {
  const text = full ? (p.text ?? p.desc) : p.desc;
  return (
    <article className="card" itemScope itemType="https://schema.org/SocialMediaPosting">
      <div className="row">
        <Link href={`/u/${p.owner}`}><Avatar src={p.owner_avatar} name={p.owner_name} /></Link>
        <div style={{ minWidth: 0 }}>
          <Link href={`/u/${p.owner}`} className="who" itemProp="author">{p.owner_name}</Link>
          <div className="handle">@{p.owner} · <time dateTime={new Date(p.created).toISOString()} itemProp="datePublished">{ago(p.created)}</time></div>
        </div>
      </div>
      {text ? <div className={full ? 'text full' : 'text'} itemProp="articleBody"><Linkify text={text} /></div> : null}
      {!full && p.long ? <Link href={`/p/${p.id}`} className="muted" style={{ fontWeight: 700 }}>Selengkapnya</Link> : null}
      {p.url && !p.bgm ? <Player id={p.id} url={p.url} secs={p.secs} /> : null}
      <div className="stats">
        <span>{num(p.likes)} sorot</span><Link href={`/p/${p.id}`}>{num(p.comments)} komentar</Link><span>{num(p.views)} dilihat</span>
        {p.url && !p.bgm ? <span>{num(p.plays)} diputar</span> : null}
      </div>
    </article>
  );
}
