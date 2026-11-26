// Bahan bersama pemeriksaan teks: pola nama alat AI, pola pernyataan "dibuat AI", dan pencocokan yang tidak salah tuduh.
// Semua pola dicocokkan sebagai KATA UTUH (supaya "audio" tidak dikira "udio") dan kalimat yang dinegasikan ("not AI generated") diabaikan.

/** Alat pembuat gambar (menghasilkan gambar dari nol). */
export const IMG_MAKERS = [
  /\bmidjourney\b/, /\bdall[-·.\s]?e\b/, /\bstable[\s-]?diffusion\b/, /\bsdxl\b/, /\bcomfy\s?ui\b/, /\bautomatic1111\b/, /\bnovel\s?ai\b/, /\binvoke\s?ai\b/, /\bfooocus\b/,
  /\bswarm\s?ui\b/, /\bleonardo\.ai\b/, /\bleonardo ai\b/, /\bideogram\b/, /\bflux\.1\b/, /\bnano banana\b/, /\badobe firefly\b/, /\bbing image creator\b/, /\bgpt-image\b/,
  /\bimagen ?[0-9]\b/, /\bdreamstudio\b/, /\bcivitai\b/, /\bplayground ?ai\b/, /\bkrea\.ai\b/, /\bcraiyon\b/, /\bnightcafe\b/, /\bdraw things\b/, /\bimage playground\b/, /\bgrok imagine\b/, /\bseedream\b/, /\bqwen[- ]image\b/, /\bhidream\b/, /\bfirefly image\b/, /\bcanva (magic|ai)\b/, /\bphotoroom ai\b/, /\bgemini 2\.[0-9] flash image\b/,  /\bmeta ai\b.{0,30}\bimagine/,
];
/** Alat pembuat suara/musik. */
export const AUD_MAKERS = [
  /\belevenlabs\b/, /\beleven ?labs\b/, /\bsuno(\.ai|\.com)?\b/, /\budio\b/, /\bmurf\.ai\b/, /\bplay\.ht\b/, /\bresemble(\.ai| ai)\b/, /\bfish[ .-]?audio\b/, /\bcoqui\b/, /\bxtts\b/, /\btortoise[- ]tts\b/,
  /\bmicrosoft azure.{0,20}(tts|speech)\b/, /\bamazon polly\b/, /\bgoogle (cloud )?(tts|text-to-speech)\b/, /\bwavenet\b/, /\bopenai\b.{0,20}\b(tts|voice)\b/, /\bstable audio\b/, /\bmusicgen\b/, /\baudiocraft\b/,
  /\briffusion\b/, /\bmubert\b/, /\bsoundraw\b/, /\bboomy\b/, /\bbeatoven\b/, /\bsynthesi[sz]ed (speech|voice)\b/, /\bvoice[ -]?clon(e|ing)\b/, /\btext[- ]to[- ]speech\b/, /\blyria\b/, /\bsuno ?v?[0-9]/, /\bmusicfx\b/, /\blyria ?[0-9]\b/, /\bacestep\b/, /\bace-step\b/, /\bproducer\.ai\b/, /\bwellsaid\b/, /\bspeechify\b/, /\bnotebooklm\b/, /\bopenai tts\b/, /\bf5-tts\b/, /\bvibevoice\b/, /\bgemini.{0,12}(tts|audio)\b/, /\bbark\b.{0,10}\bsuno\b/,
];
/** Alat pembuat video. */
export const VID_MAKERS = [
  /\bopenai.{0,12}\bsora\b/, /\bsora ?[12]\b/, /\bsora\b.{0,20}\b(openai|video)\b/, /\bgoogle veo\b/, /\bveo ?[234](\.[0-9])?\b/, /\bveo\b.{0,15}\b(google|deepmind)\b/, /\brunway(ml)?\b/, /\bgen[- ]?[234] ?(alpha|turbo)?\b.{0,12}\brunway\b/, /\bkling( ?ai)?\b/, /\bpika (labs|art)\b/, /\bpika\.art\b/, /\bpika ?[12]\.[0-9]\b/, /\bluma (ai|dream machine|labs)\b/, /\bdream machine\b/,
  /\bhailuo\b/, /\bminimax\b.{0,20}\bvideo\b/, /\bpixverse\b/, /\bvidu ?(q[0-9]|ai)\b/, /\bseedance\b/, /\bwan ?2\.[0-9]\b/, /\bhunyuan ?video\b/, /\bcogvideo(x)?\b/, /\bmochi ?1\b/, /\bgenmo\b/, /\bhaiper\b/,
  /\bstable video diffusion\b/, /\banimatediff\b/, /\bzeroscope\b/, /\bmodelscope\b/, /\bheygen\b/, /\bsynthesia\b/, /\bd-id\b/, /\bcapcut\b.{0,30}\bai\b/, /\bflow\b.{0,12}\bveo\b/, /\bgoogle veo\b/, /\bmeta movie gen\b/, /\bmovie gen\b/, /\bmidjourney video\b/, /\bgrok imagine\b/,
];
/** Pernyataan umum "dibuat AI" (berlaku untuk foto maupun audio). */
export const AI_CLAIMS = [
  /\b(ai|a\.i\.)[-\s]generated\b/, /\bgenerated (by|with|using) (an? )?(ai|artificial intelligence)\b/, /\bmade with (google )?ai\b/, /\bcreated (by|with|using) (an? )?ai\b/,
  /\bimagined with ai\b/, /\bsynthid\b/, /\bgenerative ai\b/, /\bsynthetic media\b/,
];
const NEG = /\b(not|non|no|never|isn't|bukan|tanpa|without)\s+(an?\s+)?$/;

/** Kembalikan kecocokan pertama yang tidak dinegasikan, atau null. */
export function firstHit(text, regs) {
  const s = text.toLowerCase();
  for (const r of regs) {
    const g = new RegExp(r.source, 'g');
    let m;
    while ((m = g.exec(s))) {
      if (NEG.test(s.slice(Math.max(0, m.index - 14), m.index))) continue;
      return m[0];
    }
  }
  return null;
}

/** Bersihkan teks biner menjadi teks yang bisa dicari (tanpa karakter kontrol). */
export const clean = (s) => s.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, ' ');

/** Nilai IPTC DigitalSourceType yang muncul di teks (XMP, C2PA, dll): daftar nama pendek huruf kecil. */
export function sourceTypes(text) {
  const out = new Set(), re = /digitalsourcetype\/([a-z]+)/gi;
  let m;
  while ((m = re.exec(text))) out.add(m[1].toLowerCase());
  if (/trainedalgorithmicmedia/i.test(text) && !/compositewithtrainedalgorithmicmedia/i.test(text)) out.add('trainedalgorithmicmedia');
  if (/compositewithtrainedalgorithmicmedia/i.test(text)) out.add('compositewithtrainedalgorithmicmedia');
  return [...out];
}

/** Bukti dari DigitalSourceType: 'made' (dibuat AI), 'edited' (diedit AI), atau null. */
export function kindOfSource(types) {
  if (types.includes('trainedalgorithmicmedia')) return 'made';
  if (types.includes('compositewithtrainedalgorithmicmedia')) return 'edited';
  return null;
}

/** Catatan parameter yang hanya ditulis generator gambar (A1111, ComfyUI, NovelAI, InvokeAI, Fooocus, Swarm). */
export const PARAM_PATTERNS = [
  [/\bsteps:\s*\d+,\s*sampler:/i, 'parameter Stable Diffusion (Steps/Sampler)'],
  [/\bnegative prompt:/i, 'negative prompt'],
  [/\bcfg scale:\s*[\d.]+/i, 'CFG scale'],
  [/"class_type"\s*:\s*"[A-Za-z]+"/, 'alur kerja ComfyUI'],
  [/"inputs"\s*:\s*\{[^}]*"(seed|noise_seed)"/, 'alur kerja ComfyUI'],
  [/\bsd-metadata\b|\binvokeai_metadata\b|\binvokeai_graph\b/i, 'metadata InvokeAI'],
  [/\bfooocus_scheme\b/i, 'metadata Fooocus'],
  [/\bsui_image_params\b/i, 'metadata SwarmUI'],
  [/"sampler"\s*:\s*"[a-z_0-9]+"[^}]*"steps"\s*:|"steps"\s*:\s*\d+[^}]*"sampler"\s*:/i, 'parameter NovelAI'],
  [/\bjob id:\s*[0-9a-f-]{20,}/i, 'Job ID Midjourney'],
];
