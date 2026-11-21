'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, HIcon } from './Icon';
import AnimMark from './AnimMark';
import { useStore } from '@/lib/store';

/** Menu samping untuk layar lebar (desktop). Di layar kecil disembunyikan lewat CSS; aplikasi memakai bilah bawah. */
export function DesktopRail() {
  const s = useStore(); const path = usePathname() || '/';
  const me = s.me ? `/@${s.me.username}` : '/login';
  const items: { href: string; label: string; icon?: string; hk?: 'acak' | 'hups'; on: boolean; dot?: boolean }[] = [
    { href: '/', label: s.t('rand_tab'), hk: 'acak', on: path === '/' },
    { href: '/hups', label: s.t('hups'), hk: 'hups', on: path === '/hups' },
    { href: '/search', label: s.t('search'), icon: 'search_rounded', on: path.startsWith('/search') },
    { href: '/notifications', label: s.t('notif'), icon: 'notifications_none_rounded', on: path.startsWith('/notifications'), dot: s.unread > 0 },
    { href: me, label: s.me ? s.me.name || s.me.username : s.t('login'), icon: 'person_outline_rounded', on: !!s.me && (path.startsWith(`/@${s.me.username}`) || path.startsWith('/me')) },
    { href: '/settings', label: s.t('settings'), icon: 'tune_rounded', on: path.startsWith('/settings') },
  ];
  return <nav className="rail" aria-label="Menu">
    <Link href="/" className="rail-brand" aria-label="Hulhup"><AnimMark width={38} auto slow /><span>Hulhup</span></Link>
    <div className="rail-items">
      {items.map((it) => <Link key={it.href + it.label} href={it.href} className={'rail-i' + (it.on ? ' on' : '')} aria-current={it.on ? 'page' : undefined}>
        <span className="ic">{it.hk ? <HIcon k={it.hk} size={26} /> : <Icon n={it.icon!} size={26} />}{it.dot ? <i className="dot" /> : null}</span><span className="lb">{it.label}</span></Link>)}
    </div>
    <Link href={s.me ? '/new' : '/login'} className="rail-new"><Icon n="add_rounded" size={24} /><span className="lb">{s.t('new_post')}</span></Link>
    <div className="rail-ver">Misyi · v2.0.0</div>
  </nav>;
}
