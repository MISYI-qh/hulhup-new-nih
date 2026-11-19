// Membuat web/app/intro.css: keyframes dari Intro Flutter (lib/ui.dart, _IntroState) dicuplik tiap ~19 ms.
// Jalankan: node tool/gen_intro.mjs  — hasilnya hanya transform/opacity, jalan di compositor walau hidrasi memblok JS.
import { writeFileSync } from 'node:fs';
const D = 3400, U = 96 / .72, WW = [36.76, 26.83, 12.37, 28.54, 26.83, 29.74], WT = WW.reduce((a, b) => a + b, 0), PAD = 14;
const cl = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const bez = (a, b, c, d) => (x) => { if (x <= 0) return 0; if (x >= 1) return 1; let lo = 0, hi = 1, t = x; for (let i = 0; i < 40; i++) { t = (lo + hi) / 2; const bx = 3 * a * t * (1 - t) ** 2 + 3 * c * t * t * (1 - t) + t ** 3; if (bx < x) lo = t; else hi = t; } return 3 * b * t * (1 - t) ** 2 + 3 * d * t * t * (1 - t) + t ** 3; };
const easeOutBack = bez(.175, .885, .32, 1.275), easeOutCubic = bez(.215, .61, .355, 1), easeInOutCubic = bez(.645, .045, .355, 1), easeIn = bez(.42, 0, 1, 1), easeInCubic = (x) => x ** 3;
const ramp = (t, a, b) => cl((t - a) / (b - a));
function st(t) {
  const down = easeInCubic(ramp(t, .05, .17)), up = easeOutBack(ramp(t, .21, .38));
  const rise = cl(t < .2 ? 1 - down : up, 0, 1.06), read = easeInOutCubic(ramp(t, .40, .84)), look = -.4 + 3 * read;
  const blink = t > .88 && t < .95 ? Math.sin((t - .88) / .07 * Math.PI) : 0, pop = 1 + .07 * Math.sin(Math.PI * ramp(t, .21, .45));
  const fade = 1 - easeIn(ramp(t, .95, 1)), wave = ramp(t, .22, .62), G = 96 + read * (PAD + WT);
  return { rise, read, look, blink, pop, fade, wave, G };
}
const ts = new Set(); const N = 180; for (let i = 0; i <= N; i++) ts.add(i / N); [.05, .17, .2, .21, .22, .38, .4, .45, .62, .84, .88, .95].forEach((x) => ts.add(x));
const T = [...ts].sort((a, b) => a - b);
const f = (x) => (+x.toFixed(3)).toString();
const kf = (name, fn) => `@keyframes ${name}{${T.map((t) => `${f(t * 100)}%{${fn(st(t), t)}}`).join('')}}\n`;
let css = '/* GENERATED oleh tool/gen_intro.mjs. Jangan diedit; lihat web/LOADING_SPEC.md */\n';
css += kf('iw-g', (s) => `transform:translate3d(${f(-s.G / 2)}px,${f(-U * .5 * .5 / .5 * .5 * 1)}px,0)`.replace(/,[-\d.]+px,0\)/, ',-33.333px,0)'));
css += kf('iw-pop', (s) => `transform:scale(${f(s.pop)})`);
css += kf('iw-eg', (s) => `transform:translate3d(0,${f((1 - s.rise) * .30 * U)}px,0)`);
css += kf('iw-bl', (s) => `transform:scaleY(${f(Math.max(.001, 1 - .92 * s.blink))})`);
css += kf('iw-pl', (s) => `transform:translate3d(${f(s.look * .03 * U)}px,${f(.035 * U * s.blink)}px,0) scaleY(${f(Math.max(.001, 1 - .9 * s.blink))})`);
for (let i = 0; i < 2; i++) css += kf(`iw-wv${i}`, (s) => { const k = s.wave * 1.3 - i * .22; if (s.wave <= 0 || s.wave >= 1 || k <= 0 || k >= 1) return 'opacity:0;transform:scale(.2)'; return `opacity:${f((1 - k) * .28)};transform:scale(${f((40 + easeOutCubic(k) * 170) / 210)})`; });
for (let i = 0; i < 6; i++) css += kf(`iw-l${i}`, (s) => { const p = easeOutCubic(cl(s.read * 6.6 - i)); return `opacity:${f(p)};transform:translate3d(0,${f((1 - p) * 16)}px,0)`; });
css += kf('iw-fade', (s, t) => `opacity:${f(s.fade)}${t >= 1 ? ';visibility:hidden' : ''}`);
// Tata letak statis (keadaan t=0 = logo diam, sama dengan splash)
let lx = 96 + PAD, letters = '';
'Hulhup'.split('').forEach((_, i) => { letters += `.iw-l${i}{left:${f(lx)}px;width:${f(WW[i])}px;animation-name:iw-l${i}}\n`; lx += WW[i]; });
css += `
.splash{overflow:hidden}
.iw{position:absolute;left:50%;top:50%;width:0;height:0;transform:translate3d(-48px,-33.333px,0);will-change:transform;animation:iw-g ${D}ms linear both}
.iw-mk{position:absolute;left:0;top:0;width:96px;height:66.667px;will-change:transform;animation:iw-pop ${D}ms linear both}
.iw-clip{position:absolute;left:0;top:0;width:96px;height:61.333px;overflow:hidden}
.iw-eg{position:absolute;inset:0;will-change:transform;animation:iw-eg ${D}ms linear both}
.iw-e{position:absolute;top:5.333px;width:33.333px;height:40px;border-radius:50%;background:var(--mk-e);will-change:transform;animation:iw-bl ${D}ms linear both}
.iw-e.a{left:11.333px}.iw-e.b{left:51.333px}
.iw-p{position:absolute;top:13.333px;width:14.667px;height:14.667px;border-radius:50%;background:var(--mk-p);will-change:transform;animation:iw-pl ${D}ms linear both}
.iw-p.a{left:23.6px}.iw-p.b{left:63.6px}
.iw-w{position:absolute;left:0;top:33.333px;width:96px;height:28px;border-radius:9.333px;background:var(--mk-w)}
.iw-word{position:absolute;left:0;top:0;height:66.667px;font:700 52px/66.667px Outfit,system-ui,sans-serif;letter-spacing:-1.2px;color:var(--ink,#111);white-space:nowrap}
.iw-l{position:absolute;top:0;opacity:0;will-change:transform,opacity;animation-duration:${D}ms;animation-timing-function:linear;animation-fill-mode:both}
${letters}.iw-wave{position:absolute;left:50%;top:50%;width:420px;height:420px;margin:-210px 0 0 -210px;overflow:visible}
.iw-wave circle{fill:none;stroke:var(--mk-e);stroke-width:2.4;vector-effect:non-scaling-stroke;opacity:0;transform-origin:210px 210px;animation-duration:${D}ms;animation-timing-function:linear;animation-fill-mode:both}
.iw-wave .w0{animation-name:iw-wv0}.iw-wave .w1{animation-name:iw-wv1}
.splash:not(.out){animation:iw-fade ${D}ms linear both}
.splash{--mk-e:#5b47f5;--mk-p:#fff;--mk-w:#4330d0}
@media(prefers-color-scheme:dark){html:not([data-theme=light]) .splash{--mk-e:#fff;--mk-p:#5b47f5;--mk-w:#5b47f5}}
html[data-theme=dark] .splash{--mk-e:#fff;--mk-p:#5b47f5;--mk-w:#5b47f5}
/* Kunjungan berikutnya dalam sesi / gerak dikurangi: hanya logo diam, memudar saat siap */
html.ni .splash:not(.out){animation:none}
html.ni .iw,html.ni .iw-mk,html.ni .iw-eg,html.ni .iw-e,html.ni .iw-p,html.ni .iw-l,html.ni .iw-wave circle{animation:none!important}
html.ni .iw-l,html.ni .iw-wave{display:none}
`;
writeFileSync(new URL('../web/app/intro.css', import.meta.url), css);
console.log('intro.css', (css.length / 1024).toFixed(1) + ' KB');
