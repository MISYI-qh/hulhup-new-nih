// Terjemahan setia ui.dart: markMotion (50 animasi logo) dan _PeekPainter.
export type M = { rise: number; look: number; lookY: number; cross: number; blink: number; winkL: number; winkR: number; sep: number; eyeSc: number; pupSc: number; wallDy: number; wallSx: number; dx: number; dy: number; sc: number; rot: number };
export const kMarkAnims = 50;
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
function bez(x1: number, y1: number, x2: number, y2: number) {
  return (t: number) => {
    if (t <= 0) return 0; if (t >= 1) return 1;
    let lo = 0, hi = 1, s = t;
    for (let i = 0; i < 40; i++) {
      s = (lo + hi) / 2;
      const x = 3 * (1 - s) * (1 - s) * s * x1 + 3 * (1 - s) * s * s * x2 + s * s * s;
      if (x < t) lo = s; else hi = s;
    }
    return 3 * (1 - s) * (1 - s) * s * y1 + 3 * (1 - s) * s * s * y2 + s * s * s;
  };
}
const easeInOut = bez(.42, 0, .58, 1), easeIn = bez(.42, 0, 1, 1), easeOutBack = bez(.175, .885, .32, 1.275);

export function markMotion(v: number, t: number): M {
  const m: M = { rise: 1, look: .3, lookY: 0, cross: 0, blink: 0, winkL: 0, winkR: 0, sep: 0, eyeSc: 1, pupSc: 1, wallDy: 0, wallSx: 1, dx: 0, dy: 0, sc: 1, rot: 0 };
  const PI = Math.PI, tau = 2 * PI, sin = Math.sin, cos = Math.cos, max = Math.max;
  const r = (a: number, b: number) => clamp((t - a) / (b - a), 0, 1);
  const bp = (a: number, b: number) => sin(PI * r(a, b));
  const s1 = sin(tau * t), c1 = cos(tau * t), ab = Math.abs(sin(tau * t)), fade = 1 - t;
  const cl = (x: number) => clamp(x, -1, 1);
  switch (((v % kMarkAnims) + kMarkAnims) % kMarkAnims) {
    case 0: m.rise = 1 - bp(.05, .95); break;
    case 1: m.blink = max(bp(.1, .3), bp(.4, .6)); break;
    case 2: m.look = .3 + 2.6 * s1; break;
    case 3: m.dy = -16 * bp(0, 1); break;
    case 4: m.rot = easeInOut(t) * tau; break;
    case 5: m.sc = 1 + .22 * ab * fade; m.dy = 4 * ab; break;
    case 6: m.rot = .28 * sin(3 * tau * t) * fade; break;
    case 7: m.sc = 1 + .3 * bp(0, 1); m.blink = bp(.55, .75); break;
    case 8: m.rise = 1 - .85 * ab; m.look = .3 + 1.5 * s1; break;
    case 9: m.dx = 9 * sin(4 * tau * t) * fade; m.look = .3 + 2 * sin(4 * tau * t); break;
    case 10: m.rise = 1 + .12 * bp(.2, .7); break;
    case 11: m.blink = max(bp(.05, .2), max(bp(.3, .45), bp(.55, .7))); break;
    case 12: m.lookY = 2.2 * s1; break;
    case 13: m.look = .3 + 2 * c1 - 2; m.lookY = 2 * s1; break;
    case 14: m.cross = 2.6 * bp(.1, .9); break;
    case 15: m.sep = .05 * bp(.1, .9); break;
    case 16: m.sep = -.04 * bp(.1, .9); break;
    case 17: m.eyeSc = 1 + .3 * bp(.1, .9); m.pupSc = 1 + .2 * bp(.1, .9); break;
    case 18: m.eyeSc = 1 - .3 * bp(.1, .9); break;
    case 19: m.wallDy = .04 * sin(3 * tau * t) * fade; break;
    case 20: m.wallSx = 1 - .15 * bp(.1, .5) + .1 * bp(.5, .9); break;
    case 21: m.dy = -14 * bp(0, .6); m.blink = bp(.6, .8); break;
    case 22: m.dy = -12 * ab; break;
    case 23: m.rot = PI * bp(0, 1); break;
    case 24: m.rot = .35 * sin(2 * tau * t) * fade; m.look = .3 + 2 * sin(2 * tau * t); break;
    case 25: m.dy = 6 * Math.abs(sin(2 * tau * t)); m.sc = 1 + .05 * Math.abs(sin(2 * tau * t)); break;
    case 26: m.dx = 3 * sin(10 * tau * t) * bp(0, 1); break;
    case 27: m.dx = 18 * s1; m.look = .3 + 2 * c1 - 2; break;
    case 28: m.sc = 1 + .35 * bp(0, 1); break;
    case 29: m.sc = 1 + .12 * (bp(.1, .35) + bp(.45, .7)); break;
    case 30: m.rise = 1 - bp(0, .45); m.blink = bp(.6, .8); break;
    case 31: m.blink = .9 * bp(.1, .9); m.rise = 1 - .2 * bp(.1, .9); break;
    case 32: m.winkR = bp(.2, .6); break;
    case 33: m.winkL = bp(.2, .6); break;
    case 34: m.rise = 1 - .35 * bp(.1, .9); m.look = .3 - 2 * bp(.1, .9); break;
    case 35: m.eyeSc = 1 + .35 * bp(.05, .5); m.pupSc = 1 - .4 * bp(.05, .5); m.dy = -8 * bp(0, .3); break;
    case 36: m.pupSc = 1 + .6 * s1; break;
    case 37: m.look = .3 + 2.4 * cos(3 * tau * t) - 2.4; m.lookY = 2.4 * sin(3 * tau * t); m.rot = .12 * sin(3 * tau * t); break;
    case 38: m.look = .3 + 2.5 * cl(3 * s1); break;
    case 39: m.rise = 1 - .4 * bp(.1, .9); m.look = .3 + 2.5 * cl(2 * s1); m.eyeSc = 1 - .15 * bp(.1, .9); break;
    case 40: m.dy = -12 * ab; m.eyeSc = 1 + .15 * ab; break;
    case 41: m.sc = 1 + .25 * bp(0, 1); m.rise = 1 + .1 * bp(.3, .7); m.blink = bp(.7, .9); break;
    case 42: m.sc = 1 + .08 * sin(3 * tau * t) * fade; m.wallSx = 1 + .1 * sin(3 * tau * t) * fade; m.wallDy = .015 * sin(3 * tau * t) * fade; break;
    case 43: m.rot = .2 * bp(.1, .9); m.lookY = -2 * bp(.1, .9); break;
    case 44: m.rise = t < .7 ? 1 - easeIn(r(0, .12)) : easeOutBack(r(.7, .9)); break;
    case 45: m.rise = 1 - .9 * Math.abs(sin(3 * PI * t)); break;
    case 46: m.eyeSc = 1 + .3 * bp(.05, .4); m.dx = 6 * sin(12 * tau * t) * bp(.05, .6); break;
    case 47: m.look = .3 + 2.2 * c1 - 2.2; m.lookY = -2.2 * s1; m.rise = 1 + .08 * bp(.1, .9); break;
    case 48: m.look = .3 + 2 * cos(2 * tau * t) - 2; m.lookY = 2 * sin(2 * tau * t); m.sep = .03 * s1; break;
    default: m.rise = 1 - bp(0, .3); m.dy = -14 * bp(.35, .65); m.sc = 1 + .1 * bp(.35, .65); m.blink = bp(.7, .9);
  }
  return m;
}

/** Terjemahan _PeekPainter.paint ke Canvas 2D. Ukuran kanvas: w x (w*.5/.72). */
export function paintPeek(ctx: CanvasRenderingContext2D, W: number, H: number, col: [string, string, string], m: Partial<M> = {}) {
  const d = { rise: 1, look: .3, blink: 0, lookY: 0, cross: 0, winkL: 0, winkR: 0, sep: 0, eyeSc: 1, pupSc: 1, wallDy: 0, wallSx: 1, ...m } as M;
  const u = W / .72, cx = W / 2, cy = H / 2;
  const o = (x: number, y: number): [number, number] => [cx + x * u, cy + y * u];
  const lift = (1 - clamp(d.rise, 0, 1.1)) * .30;
  ctx.clearRect(0, 0, W, H);
  ctx.save(); ctx.beginPath(); ctx.rect(-1e5, -1e5, 2e5, o(0, .21 + d.wallDy)[1] + 1e5); ctx.clip();
  for (const k of [-1, 1]) {
    const bl = clamp(clamp(d.blink, 0, 1) + (k < 0 ? clamp(d.winkL, 0, 1) : clamp(d.winkR, 0, 1)), 0, 1);
    const ec = o(k * (.15 + d.sep), -.06 + lift);
    ctx.fillStyle = col[0]; ctx.beginPath(); ctx.ellipse(ec[0], ec[1], .125 * u * d.eyeSc, Math.max(.001, .15 * u * d.eyeSc * (1 - .92 * bl)), 0, 0, 7); ctx.fill();
    const pr = .055 * u * d.pupSc, lx = d.look + (k < 0 ? d.cross : -d.cross);
    ctx.fillStyle = col[1]; ctx.beginPath(); ctx.ellipse(ec[0] + (.022 + lx * .03) * u, ec[1] + (-.035 * (1 - bl) + d.lookY * .03) * u, Math.max(.001, pr), Math.max(.001, pr * (1 - .9 * bl)), 0, 0, 7); ctx.fill();
  }
  ctx.restore();
  const [x0, y0] = o(-.36 * d.wallSx, d.wallDy), [x1, y1] = o(.36 * d.wallSx, .21 + d.wallDy), rr = .07 * u;
  ctx.fillStyle = col[2]; ctx.beginPath(); (ctx as any).roundRect(x0, y0, x1 - x0, y1 - y0, rr); ctx.fill();
}
