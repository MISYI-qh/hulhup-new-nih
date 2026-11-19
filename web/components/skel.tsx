/** Kerangka muat per halaman: bentuknya mengikuti tata letak asli halaman (lihat LOADING_SPEC.md). */
const S = ({ w, h, r, mb, style }: { w?: number | string; h: number; r?: number | string; mb?: number; style?: React.CSSProperties }) =>
  <div className="sk" style={{ width: w ?? '100%', height: h, borderRadius: r, marginBottom: mb, flex: 'none', ...style }} />;
const Dot = ({ n, mb }: { n: number; mb?: number }) => <S w={n} h={n} r="50%" mb={mb} />;
const Wrap = ({ children, pad = true }: { children: React.ReactNode; pad?: boolean }) =>
  <div className={pad ? 'pad' : undefined} style={{ paddingTop: 8, paddingBottom: 40 }} aria-busy="true" aria-label="Memuat">{children}</div>;

/** Satu kartu post (pemilik, label, teks, bilah audio, aksi). */
export function SkPost({ text = 2 }: { text?: number }) {
  return <div className="hcard" style={{ display: 'block' }}>
    <div className="row2"><Dot n={44} /><div style={{ flex: 1, display: 'grid', gap: 7 }}><S h={13} w="42%" /><S h={10} w="26%" /></div></div>
    <div style={{ display: 'grid', gap: 8, paddingTop: 14 }}>{Array.from({ length: text }, (_, i) => <S key={i} h={12} w={i === text - 1 ? '78%' : '100%'} />)}</div>
    <S h={44} r={22} style={{ marginTop: 14 }} />
    <div className="row2" style={{ gap: 22, paddingTop: 14 }}><S w={44} h={14} /><S w={44} h={14} /><S w={44} h={14} /></div>
  </div>;
}
export function SkFeed({ n = 3, pad = true }: { n?: number; pad?: boolean }) {
  return <Wrap pad={pad}>{Array.from({ length: n }, (_, i) => <SkPost key={i} text={i % 2 ? 1 : 2} />)}</Wrap>;
}
/** Profil: foto, nama, @pengguna, bio, statistik, tombol, tab, lalu post. */
export function SkProfile() {
  return <div style={{ paddingBottom: 40 }} aria-busy="true" aria-label="Memuat">
    <div style={{ padding: '10px 24px 0' }}><Dot n={96} /></div>
    <div style={{ padding: '16px 24px 0' }}>
      <S h={26} w="46%" r={10} /><S h={15} w="28%" style={{ marginTop: 8 }} />
      <div style={{ display: 'grid', gap: 8, marginTop: 14 }}><S h={13} /><S h={13} w="70%" /></div>
      <div className="row2" style={{ gap: 22, marginTop: 16 }}><S w={78} h={18} /><S w={78} h={18} /><S w={78} h={18} /></div>
      <div style={{ marginTop: 18, display: 'grid', gap: 10 }}><S h={52} r={26} /></div>
    </div>
    <div style={{ padding: '22px 20px 0' }}><S h={48} r={24} style={{ marginBottom: 14 }} /><SkPost /><SkPost text={1} /></div>
  </div>;
}
/** Daftar pengguna (pengikut, mengikuti, relasi). */
export function SkUsers({ n = 6, head = false }: { n?: number; head?: boolean }) {
  return <Wrap>{head ? <S h={13} w={90} style={{ margin: '6px 0 12px 4px' }} /> : null}
    {Array.from({ length: n }, (_, i) => <div key={i} className="urow"><Dot n={46} /><div style={{ flex: 1, display: 'grid', gap: 7 }}><S h={14} w={i % 2 ? '38%' : '52%'} /><S h={11} w="26%" /></div><S w={24} h={24} r="50%" /></div>)}</Wrap>;
}
export function SkRel() {
  return <Wrap><S h={13} w={110} style={{ margin: '6px 0 12px 4px' }} />
    {Array.from({ length: 4 }, (_, i) => <div key={i} className="urow"><Dot n={46} /><div style={{ flex: 1, display: 'grid', gap: 7 }}><S h={14} w="44%" /><S h={11} w="26%" /></div><S w={64} h={26} r={13} /></div>)}</Wrap>;
}
/** Notifikasi: kartu bulat dengan avatar + lencana kecil. */
export function SkNotif() {
  return <Wrap>{Array.from({ length: 7 }, (_, i) => <div key={i} className="row2" style={{ gap: 14, padding: 12, background: 'var(--soft)', borderRadius: 26, marginBottom: 10 }}>
    <Dot n={46} /><div style={{ flex: 1, display: 'grid', gap: 8 }}><S h={13} /><S h={11} w={i % 2 ? '34%' : '52%'} /></div></div>)}</Wrap>;
}
/** Halaman post: kartu besar lalu komentar. */
export function SkPostPage() {
  return <div aria-busy="true" aria-label="Memuat" style={{ padding: '8px 20px 40px' }}>
    <div className="row2"><Dot n={48} /><div style={{ flex: 1, display: 'grid', gap: 7 }}><S h={14} w="40%" /><S h={11} w="24%" /></div></div>
    <div style={{ display: 'grid', gap: 9, padding: '16px 0' }}><S h={13} /><S h={13} /><S h={13} w="60%" /></div>
    <S h={52} r={26} /><div className="row2" style={{ gap: 22, padding: '16px 0 22px' }}><S w={48} h={16} /><S w={48} h={16} /><S w={48} h={16} /></div>
    {[0, 1, 2].map((i) => <div key={i} className="row2" style={{ alignItems: 'flex-start', gap: 12, marginBottom: 18 }}><Dot n={36} /><div style={{ flex: 1, display: 'grid', gap: 7 }}><S h={12} w="30%" /><S h={12} /><S h={12} w="64%" /></div></div>)}
  </div>;
}
/** Kalender runtun. */
export function SkStreak() {
  return <Wrap><S h={64} r={26} /><div className="row2" style={{ marginTop: 18 }}><Dot n={40} /><div style={{ flex: 1 }} /><S w={120} h={18} /><div style={{ flex: 1 }} /><Dot n={40} /></div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 8, marginTop: 16 }}>{Array.from({ length: 35 }, (_, i) => <S key={i} h={40} r="50%" />)}</div></Wrap>;
}
/** Formulir / pengaturan: baris bidang. */
export function SkForm() {
  return <Wrap>{[0, 1, 2, 3].map((i) => <div key={i} style={{ marginBottom: 18 }}><S h={12} w={86} mb={8} /><S h={52} r={26} /></div>)}<S h={52} r={26} /></Wrap>;
}
export function SkRows({ n = 4 }: { n?: number }) {
  return <Wrap>{Array.from({ length: n }, (_, i) => <S key={i} h={68} r={26} mb={10} />)}</Wrap>;
}

/** Kerangka tingkat rute (muncul saat berpindah halaman): bilah atas + isi sesuai halaman tujuan. */
export function SkRoute({ k, back = true }: { k: 'feed' | 'profile' | 'notif' | 'post' | 'users' | 'streak' | 'form' | 'rows'; back?: boolean }) {
  const body = k === 'profile' ? <SkProfile /> : k === 'notif' ? <SkNotif /> : k === 'post' ? <SkPostPage /> : k === 'users' ? <SkUsers /> : k === 'streak' ? <SkStreak /> : k === 'form' ? <SkForm /> : k === 'rows' ? <SkRows /> : <SkFeed />;
  return <div className="app"><div className="topbar">{back ? <div className="ibtn" /> : <div style={{ width: 44 }} />}<div className="mid" style={{ display: 'flex', justifyContent: 'center' }}><div className="sk" style={{ width: 110, height: 20 }} /></div><div className="ibtn" /></div>{body}</div>;
}
