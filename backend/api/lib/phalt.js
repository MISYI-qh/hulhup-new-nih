// Mesin cadangan bergaya OpenAI (OpenRouter, Clauvia) untuk Phipop saat Gemini penuh/ditolak.
// Menerima isi permintaan format Gemini, mengembalikan balasan berformat Gemini supaya sisa kode tidak berubah.

const lower = (s) => Array.isArray(s) ? s.map(lower) : s && typeof s === 'object' ? Object.fromEntries(Object.entries(s).map(([k, v]) => [k, k === 'type' && typeof v === 'string' ? v.toLowerCase() : lower(v)])) : s;

export function providers() {
  const list = [];
  const or = process.env.OPENROUTER_API_KEY;
  if (or) for (const m of (process.env.PHIPOP_OR_MODELS || 'google/gemini-2.5-flash,openai/gpt-4o-mini').split(',').map((x) => x.trim()).filter(Boolean))
    list.push({ name: 'openrouter', url: 'https://openrouter.ai/api/v1/chat/completions', key: or, model: m, headers: { 'HTTP-Referer': 'https://hulhup.my.id', 'X-Title': 'Hulhup' } });
  const cv = process.env.CLAUVIA_API_KEY, base = process.env.CLAUVIA_BASE_URL;
  if (cv && base) for (const m of (process.env.CLAUVIA_MODELS || '').split(',').map((x) => x.trim()).filter(Boolean))
    list.push({ name: 'clauvia', url: base.replace(/\/+$/, '') + '/chat/completions', key: cv, model: m, headers: {} });
  return list;
}

export function toOpenAI(body, model) {
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
        else if (p.inlineData && /^image\//.test(p.inlineData.mimeType || '')) imgs.push({ type: 'image_url', image_url: { url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}` } });
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
export async function altcall(body, deadline, perCall = 20000) {
  let last = null;
  for (const p of providers()) {
    const id = p.name + p.model; if ((cool.get(id) || 0) > Date.now()) continue;
    const left = deadline - Date.now(); if (left < 3000) break;
    const ac = new AbortController(); const tm = setTimeout(() => ac.abort(), Math.min(perCall, left));
    try {
      const r = await fetch(p.url, { method: 'POST', signal: ac.signal, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + p.key, ...p.headers }, body: JSON.stringify(toOpenAI(body, p.model)) });
      if (!r.ok) { const e = new Error('alt'); e.status = r.status; console.error('phipop alt', p.name, p.model, r.status, String(await r.text().catch(() => '')).slice(0, 300).replace(/(sk-|clv_)[\w-]+/g, '***')); throw e; }
      const j = await r.json(); const out = fromOpenAI(j);
      if (!out.candidates[0].content.parts.length) { console.error('phipop alt empty', p.name, p.model); throw new Error('empty'); }
      return out;
    } catch (e) { last = e; cool.set(id, Date.now() + (e.status === 402 || e.status === 401 || e.status === 404 || e.status === 400 ? 10 * 60000 : 30000)); }
    finally { clearTimeout(tm); }
  }
  throw last ?? new Error('no_alt');
}
