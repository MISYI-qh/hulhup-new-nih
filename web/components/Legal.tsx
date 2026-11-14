import legal from '@/content/legal.json';
type K = 'about' | 'policy' | 'privacy';
export default function Legal({ k, title }: { k: K; title: string }) {
  const [id, en] = legal[k] as string[];
  return (
    <article>
      <h1>{title}</h1>
      {id.split('\n\n').map((t, i) => <p key={i} style={{ whiteSpace: 'pre-wrap' }}>{t}</p>)}
      <details style={{ marginTop: 24 }}><summary>English</summary>
        {en.split('\n\n').map((t, i) => <p key={i} lang="en" style={{ whiteSpace: 'pre-wrap' }}>{t}</p>)}
      </details>
    </article>
  );
}
