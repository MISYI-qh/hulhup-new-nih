import type { Metadata } from 'next';
import legal from '@/content/legal.json';
export const metadata: Metadata = { title: 'FAQ', description: 'Pertanyaan yang sering diajukan tentang Hulhup.', alternates: { canonical: '/faq' } };
export default function Faq() {
  const items = legal.faq.id as string[][];
  const ld = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: items.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <h1>FAQ</h1>
      {items.map(([q, a], i) => <details className="card" key={i}><summary><b>{q}</b></summary><p style={{ whiteSpace: 'pre-wrap' }}>{a}</p></details>)}
    </>
  );
}
