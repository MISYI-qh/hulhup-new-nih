// Evaluasi Deks pada korpus uji: node tools/deks-eval.mjs <folder korpus>
// Struktur: img/real, img/ai, aud/real, aud/ai_v (nama berkas ...__varian.ext). Melaporkan yang ditandai per varian.
import fs from 'node:fs';
import path from 'node:path';
import { deksImage, deksAudio } from '../lib/deks/index.js';

const root = process.argv[2];
if (!root) { console.error('pakai: node tools/deks-eval.mjs <korpus>'); process.exit(1); }
const rows = [];
for (const [type, dirs] of [['image', [['real', 'img/real'], ['ai', 'img/ai']]], ['audio', [['real', 'aud/real'], ['ai', 'aud/ai_v']]]]) {
  for (const [cls, d] of dirs) {
    for (const f of fs.readdirSync(path.join(root, d)).sort()) {
      const b = fs.readFileSync(path.join(root, d, f));
      const t0 = Date.now();
      const rep = type === 'image' ? deksImage(b) : deksAudio(b);
      rows.push({ type, cls, f, v: (f.split('__')[1] || '').split('.')[0], ai: rep.ai, why: rep.hits.map((h) => h.why).join('; '), ms: Date.now() - t0 });
    }
  }
}
for (const type of ['image', 'audio']) {
  console.log(`\n== ${type}`);
  for (const cls of ['real', 'ai']) {
    const rs = rows.filter((r) => r.type === type && r.cls === cls);
    const by = {};
    for (const r of rs) { by[r.v] = by[r.v] || [0, 0]; by[r.v][0]++; if (r.ai) by[r.v][1]++; }
    console.log(cls.padEnd(5), `total ${rs.length}, ditandai ${rs.filter((r) => r.ai).length}`, JSON.stringify(by));
    for (const r of rs.filter((r) => r.ai).slice(0, 8)) console.log('   ditandai:', r.f, '=>', r.why);
  }
  const ms = rows.filter((r) => r.type === type).map((r) => r.ms).sort((a, b) => a - b);
  console.log('waktu median/maks ms:', ms[Math.floor(ms.length / 2)], ms[ms.length - 1]);
}
