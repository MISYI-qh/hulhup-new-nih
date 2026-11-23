// Mesin cadangan bergaya OpenAI (OpenRouter, Clauvia) untuk Phipop saat Gemini penuh/ditolak.
// Menerima isi permintaan format Gemini, mengembalikan balasan berformat Gemini supaya sisa kode tidak berubah.

const lower = (s) => Array.isArray(s) ? s.map(lower) : s && typeof s === 'object' ? Object.fromEntries(Object.entries(s).map(([k, v]) => [k, k === 'type' && typeof v === 'string' ? v.toLowerCase() : lower(v)])) : s;

let cvModels = []; let cvAt = 0;
// tanpa daftar model manual: tanya /models milik Clouvia lalu pilih yang cocok untuk ngobrol (di-cache 1 jam)
async function discover() {
  const cv = process.env.CLAUVIA_API_KEY; if (!cv || process.env.CLAUVIA_MODELS || Date.now() - cvAt < 3600000) return; cvAt = Date.now();
  const base = (process.env.CLAUVIA_BASE_URL || 'https://router.clouvia.id/v1').replace(/\/+$/, '');
  try {
    const r = await fetch(base + '/models', { headers: { authorization: 'Bearer ' + cv }, signal: AbortSignal.timeout(6000) });
    if (!r.ok) { console.error('phipop clouvia /models', r.status, String(await r.text().catch(() => '')).slice(0, 200)); return; }
    const ids = ((await r.json())?.data || []).map((x) => x.id).filter(Boolean);
    const want = [/gemini.*flash(?!.*(lite|image|tts))/i, /gpt-4o-mini|gpt-4\.1-mini|gpt-5.*mini/i, /claude.*(haiku|sonnet)/i, /deepseek.*(chat|v3)/i, /llama.*(70b|maverick)/i, /qwen/i];
    const pick = []; for (const w of want) { const m = ids.find((i) => w.test(i) && !pick.includes(i)); if (m) pick.push(m); }
    cvModels = pick.length ? pick.slice(0, 3) : ids.slice(0, 2);
    console.error('phipop clouvia models', ids.length, '->', cvModels.join(','));
  } catch (e) { console.error('phipop clouvia /models gagal', String(e.message || e).slice(0, 100)); }
}

// kemampuan media per model: img = gambar; av = audio+video langsung (Gemini lewat OpenRouter). Selain itu audio/video diubah jadi transkrip.
function capsOf(m, router) {
  const s = String(m).toLowerCase();
  const av = router && /gemini/.test(s);
  const img = av || /gpt-4o|gpt-4\.1|gpt-5|claude|gemma-3|vision|scout|maverick|pixtral|llama-4|mistral-(small|medium|large)|gemini|qwen.*vl/.test(s);
  return { img, av };
}
const AMIME = { 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav' };
// transkrip suara (audio atau suara dalam video) lewat Whisper di Groq; di-cache per isi
const txCache = new Map();
async function transcribe(part) {
  const d = part.inlineData; if (!d?.data) return null;
  const key = d.mimeType + d.data.length + d.data.slice(0, 40) + d.data.slice(-40);
  if (txCache.has(key)) return txCache.get(key);
  const keys = [...new Set([process.env.GROQ_API_KEY, ...String(process.env.GROQ_API_KEYS || '').split(',')].map((x) => (x || '').trim()).filter(Boolean))];
  let out = null;
  for (const k of keys) {
    try {
      const ext = (d.mimeType.split('/')[1] || 'mp3').split(';')[0].replace('mpeg', 'mp3').replace('x-m4a', 'm4a');
      const fd = new FormData(); fd.append('file', new Blob([Buffer.from(d.data, 'base64')], { type: d.mimeType }), 'a.' + ext); fd.append('model', 'whisper-large-v3-turbo'); fd.append('response_format', 'text'); fd.append('language', 'id');
      const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { authorization: 'Bearer ' + k }, body: fd, signal: AbortSignal.timeout(25000) });
      if (r.ok) { out = (await r.text()).trim(); break; }
      console.error('phipop whisper', r.status);
    } catch (e) { console.error('phipop whisper gagal', String(e.message || e).slice(0, 80)); }
  }
  if (out !== null) { txCache.set(key, out); if (txCache.size > 30) txCache.delete(txCache.keys().next().value); }
  return out;
}

// kumpulan kunci: satu kunci tunggal + daftar dipisah koma; urutan diputar tiap panggilan agar beban merata
let rr = 0;
function pool(single, plural, onlyPlural = false) {
  const ks = [...new Set([onlyPlural ? '' : process.env[single], ...String(process.env[plural] || '').split(',')].map((x) => (x || '').trim()).filter(Boolean))];
  if (ks.length > 1) { const o = (rr++) % ks.length; return [...ks.slice(o), ...ks.slice(0, o)]; }
  return ks;
}

// lvl: 1 = gratis/kecil (pertanyaan ringan), 2 = gratis/besar, 3 = berbayar/kuat (Clouvia, OpenRouter)
export function providers(lvls = [3, 2, 1]) {
  const list = [];
  for (const or of pool('OPENROUTER_API_KEY', 'OPENROUTER_API_KEYS'))
    for (const m of (process.env.PHIPOP_OR_MODELS || 'google/gemini-2.5-flash,openai/gpt-4o-mini').split(',').map((x) => x.trim()).filter(Boolean))
      list.push({ lvl: 3, name: 'openrouter', url: 'https://openrouter.ai/api/v1/chat/completions', key: or, model: m, headers: { 'HTTP-Referer': 'https://hulhup.my.id', 'X-Title': 'Hulhup' }, caps: capsOf(m, true) });
  // model gratis OpenRouter (satu akun satu kunci): dicoba setelah yang berbayar
  for (const or of pool('OPENROUTER_API_KEY', 'OPENROUTER_API_KEYS'))
    for (const m of (process.env.PHIPOP_ORFREE_MODELS || 'meta-llama/llama-3.3-70b-instruct:free,google/gemma-3-27b-it:free').split(',').map((x) => x.trim()).filter(Boolean))
      list.push({ lvl: 2, name: 'openrouter', url: 'https://openrouter.ai/api/v1/chat/completions', key: or, model: m, headers: { 'HTTP-Referer': 'https://hulhup.my.id', 'X-Title': 'Hulhup' }, caps: capsOf(m, true) });
  const cv = process.env.CLAUVIA_API_KEY;
  if (cv) { const base = (process.env.CLAUVIA_BASE_URL || 'https://router.clouvia.id/v1').replace(/\/+$/, '');
    const ms = (process.env.CLAUVIA_MODELS || '').split(',').map((x) => x.trim()).filter(Boolean);
    for (const m of ms.length ? ms : cvModels.length ? cvModels : ['']) if (m || !ms.length) list.push({ lvl: 3, name: 'clouvia', url: base + '/chat/completions', key: cv, model: m, headers: {}, base, caps: capsOf(m, true) }); }
  const EX = [
    ['groq', 'GROQ_API_KEY', 'https://api.groq.com/openai/v1', [['llama-3.1-8b-instant', 1], ['llama-3.3-70b-versatile', 2], ['meta-llama/llama-4-scout-17b-16e-instruct', 2]]],
    ['mistral', 'MISTRAL_API_KEY', 'https://api.mistral.ai/v1', [['mistral-small-latest', 1], ['pixtral-large-latest', 2]]],
    ['pollinations', 'POLLINATIONS_API_KEY', 'https://gen.pollinations.ai/v1', [['openai', 1]]],
    ['together', 'TOGETHER_API_KEY', 'https://api.together.xyz/v1', [['meta-llama/Llama-3.3-70B-Instruct-Turbo', 2]]],
    ['cohere', 'COHERE_API_KEYS', 'https://api.cohere.com/compatibility/v1', [['command-r7b-12-2024', 1], ['command-a-03-2025', 2], ['command-a-vision-07-2025', 2]]],
    ['nvidia', 'NVIDIA_API_KEYS', 'https://integrate.api.nvidia.com/v1', [['meta/llama-3.1-8b-instruct', 1], ['meta/llama-3.3-70b-instruct', 2], ['meta/llama-3.2-11b-vision-instruct', 2]]],
    ['sambanova', 'SAMBANOVA_API_KEYS', 'https://api.sambanova.ai/v1', [['Meta-Llama-3.1-8B-Instruct', 1], ['Meta-Llama-3.3-70B-Instruct', 2], ['Llama-4-Maverick-17B-128E-Instruct', 2]]]];
  for (const [name, env, base, ms] of EX) {
    const ov = (process.env['PHIPOP_' + name.toUpperCase() + '_MODELS'] || '').split(',').map((x) => x.trim()).filter(Boolean);
    for (const k of pool(env.replace(/S$/, ''), env, name === 'cohere')) // cohere: kunci lama diabaikan
      for (const [m, lvl] of ov.length ? ov.map((x) => [x, 2]) : ms) list.push({ lvl, name, url: base + '/chat/completions', key: k, model: m, headers: {}, caps: capsOf(m, false) }); }
  return lvls.flatMap((l) => list.filter((p) => p.lvl === l));
}

export function toOpenAI(body, model, caps = {}, tx = new WeakMap()) {
  const msgs = [];
  const sys = (body.systemInstruction?.parts || []).map((p) => p.text || '').join('\n').trim();
  if (sys) msgs.push({ role: 'system', content: sys });
  let n = 0; let pending = []; // id panggilan alat yang belum dijawab
  for (const c of body.contents || []) {
    const parts = c.parts || [];
    if (c.role === 'model') {
      const text = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('');
      const calls = parts.filter((p) => p.functionCall).map((p) => { const id = 'call_' + (++n); pending.push({ id, name: p.functionCall.name }); return { id, type: 'function', function: { name: p.functionCall.name, arguments: JSON.stringify(p.functionCall.args || {}) } }; });
      msgs.push({ role: 'assistant', content: text || (calls.length ? null : ''), ...(calls.length ? { tool_calls: calls } : {}) });
    } else {
      const imgs = []; const texts = [];
      for (const p of parts) {
        if (p.functionResponse) { const i = pending.findIndex((x) => x.name === p.functionResponse.name); const id = i >= 0 ? pending.splice(i, 1)[0].id : 'call_x'; msgs.push({ role: 'tool', tool_call_id: id, content: JSON.stringify(p.functionResponse.response ?? {}).slice(0, 12000) }); }
        else if (p.text) texts.push(p.text);
        else if (p.inlineData && /^image\//.test(p.inlineData.mimeType || '')) { if (caps.img) imgs.push({ type: 'image_url', image_url: { url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}` } }); else texts.push('[ada lampiran gambar, tapi mesin ini tidak bisa melihat gambar]'); }
        else if (p.inlineData && caps.av && /^audio\//.test(p.inlineData.mimeType || '') && AMIME[p.inlineData.mimeType]) imgs.push({ type: 'input_audio', input_audio: { data: p.inlineData.data, format: AMIME[p.inlineData.mimeType] } });
        else if (p.inlineData && caps.av && /^video\//.test(p.inlineData.mimeType || '')) imgs.push({ type: 'video_url', video_url: { url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}` } });
        else if (p.inlineData && tx.has(p)) texts.push(tx.get(p) ? `[transkrip suara dari ${/^video/.test(p.inlineData.mimeType) ? 'video' : 'audio'} (hasil speech-to-text, visual/musik tidak ikut terbaca)]: ${tx.get(p).slice(0, 4000)}` : `[${/^video/.test(p.inlineData.mimeType) ? 'video' : 'audio'} dilampirkan tapi tidak ada ucapan yang terbaca (mungkin musik/instrumen/hening)]`);
        else if (p.inlineData || p.fileData) texts.push('[lampiran audio/video tidak bisa dibuka oleh mesin ini]');
      }
      if (texts.length || imgs.length) msgs.push({ role: 'user', content: imgs.length ? [{ type: 'text', text: texts.join('\n') || 'Lampiran media:' }, ...imgs] : texts.join('\n') });
    }
  }
  const decls = (body.tools || []).flatMap((t) => t.functionDeclarations || []);
  const gc = body.generationConfig || {};
  return { model, messages: msgs, max_tokens: Math.min(gc.maxOutputTokens || 1200, 4000), temperature: gc.temperature ?? 0.9,
    ...(decls.length ? { tools: decls.map((d) => ({ type: 'function', function: { name: d.name, description: d.description, parameters: lower(d.parameters || { type: 'object', properties: {} }) } })), tool_choice: 'auto' } : {}) };
}

export function fromOpenAI(j) {
  const ch = j?.choices?.[0]; const m = ch?.message || {};
  const parts = [];
  if (m.content) parts.push({ text: typeof m.content === 'string' ? m.content : (m.content || []).map((x) => x.text || '').join('') });
  for (const tc of m.tool_calls || []) { let args = {}; try { args = JSON.parse(tc.function?.arguments || '{}'); } catch {} parts.push({ functionCall: { name: tc.function?.name, args } }); }
  return { candidates: [{ content: { role: 'model', parts }, finishReason: ch?.finish_reason === 'length' ? 'MAX_TOKENS' : 'STOP' }] };
}

const cool = new Map();
/** Coba tiap penyedia cadangan sampai batas waktu; lempar galat terakhir bila semua gagal. */
export async function altcall(body, deadline, perCall = 20000, lvls = [3, 2, 1]) {
  let last = null; await discover();
  const tx = new WeakMap(); const imgNeed = [], avNeed = [];
  for (const c of body.contents || []) for (const x of c.parts || []) { if (x.inlineData && /^image\//.test(x.inlineData.mimeType || '')) imgNeed.push(x); else if (x.inlineData && /^(audio|video)\//.test(x.inlineData.mimeType || '')) avNeed.push(x); }
  if (avNeed.length) await Promise.all(avNeed.slice(0, 2).map(async (x) => { tx.set(x, await transcribe(x)); }));
  let plist = providers(lvls);
  if (imgNeed.length || avNeed.length) { const sc = (p) => (avNeed.length && p.caps?.av ? 2 : 0) + (imgNeed.length && p.caps?.img ? 1 : 0); plist = plist.map((p, i) => [p, i]).sort((a, b) => sc(b[0]) - sc(a[0]) || a[1] - b[1]).map((x) => x[0]); }
  for (const p of plist) {
    const id = p.name + p.model + p.key.slice(-6); if ((cool.get(id) || 0) > Date.now()) continue;
    const left = deadline - Date.now(); if (left < 3000) break;
    const ac = new AbortController(); const tm = setTimeout(() => ac.abort(), Math.min(perCall, left));
    try {
      const r = await fetch(p.url, { method: 'POST', signal: ac.signal, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + p.key, ...p.headers }, body: JSON.stringify(toOpenAI(body, p.model, p.caps || {}, tx)) });
      if (!r.ok) { const e = new Error('alt'); e.status = r.status; console.error('phipop alt', p.name, p.model, r.status, String(await r.text().catch(() => '')).slice(0, 300).replace(/(sk-|sk_|clv_|gsk_|mstrl_|key_)[\w-]+/g, '***')); throw e; }
      const j = await r.json(); const out = fromOpenAI(j);
      if (!out.candidates[0].content.parts.length) { console.error('phipop alt empty', p.name, p.model); throw new Error('empty'); }
      return out;
    } catch (e) { last = e; cool.set(id, Date.now() + (e.status === 402 || e.status === 401 || e.status === 404 || e.status === 400 ? 10 * 60000 : 30000)); }
    finally { clearTimeout(tm); }
  }
  throw last ?? new Error('no_alt');
}
