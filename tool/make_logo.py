"""Membuat semua aset logo Hulhup (ikon, splash, notifikasi, favicon) dari satu bentuk: huruf H bulat dengan titik loncat."""
import math, os, sys
from PIL import Image, ImageDraw, ImageFont, ImageChops
import numpy as np
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = sys.argv[1] if len(sys.argv) > 1 else None
C1, C2, C3 = (0xFF, 0x8A, 0x3D), (0xFF, 0x62, 0x4F), (0xF2, 0x3F, 0x6C)  # jingga hangat -> koral -> merah muda
SS = 4

def mark_mask(n, scale=1.0):
    """Huruf H bulat tebal: kaki kiri tinggi, kaki kanan pendek dengan titik yang "loncat" di atasnya (terbaca H, "hi", dan hups!)."""
    N = n * SS
    m = Image.new('L', (N, N), 0)
    d = ImageDraw.Draw(m)
    def P(v): return 0.5 * N + (v - 0.5) * N * scale
    w = 0.15
    d.rounded_rectangle((P(.27), P(.20), P(.27 + w), P(.80)), radius=(P(w) - P(0)) / 2, fill=255)
    d.rounded_rectangle((P(.58), P(.44), P(.58 + w), P(.80)), radius=(P(w) - P(0)) / 2, fill=255)
    d.rounded_rectangle((P(.27), P(.44), P(.73), P(.44 + w)), radius=(P(w) - P(0)) / 2, fill=255)
    d.ellipse((P(.575), P(.20), P(.745), P(.37)), fill=255)
    return m.resize((n, n), Image.LANCZOS)

def gradient(n):
    y, x = np.mgrid[0:n, 0:n] / (n - 1)
    t = np.clip((x * 0.55 + y * 0.9) / 1.45, 0, 1)
    out = np.zeros((n, n, 3), np.float32)
    for k in range(3):
        a, b, c = C1[k], C2[k], C3[k]
        out[..., k] = np.where(t < .5, a + (b - a) * (t / .5), b + (c - b) * ((t - .5) / .5))
    return Image.fromarray(out.astype(np.uint8), 'RGB')

def squircle(n, r=0.225):
    m = Image.new('L', (n * SS, n * SS), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, n * SS - 1, n * SS - 1), radius=int(r * n * SS), fill=255)
    return m.resize((n, n), Image.LANCZOS)

def icon(n, rounded=False, scale=1.0, white=(255, 255, 255)):
    bg = gradient(n).convert('RGBA')
    # kilau lembut di kiri atas
    gl = Image.new('RGBA', (n, n), (255, 255, 255, 0)); a = np.zeros((n, n), np.float32)
    yy, xx = np.mgrid[0:n, 0:n] / n
    a = np.clip(1 - np.hypot(xx - .2, yy - .1) / .75, 0, 1) ** 2 * 70
    gl.putalpha(Image.fromarray(a.astype(np.uint8)))
    bg = Image.alpha_composite(bg, gl)
    mk = Image.new('RGBA', (n, n), white + (255,)); mk.putalpha(mark_mask(n, scale))
    out = Image.alpha_composite(bg, mk)
    if rounded: out.putalpha(squircle(n))
    return out

def flat_mark(n, color, scale=1.0):
    im = Image.new('RGBA', (n, n), color + (255,)); im.putalpha(mark_mask(n, scale)); return im

def wordmark(color, w=880, h=360):
    f = ImageFont.truetype(os.path.join(ROOT, 'assets/fonts/Outfit-Bold.ttf'), 150)
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    bb = d.textbbox((0, 0), 'Hulhup', font=f); tw, th = bb[2] - bb[0], bb[3] - bb[1]
    d.text(((w - tw) / 2 - bb[0], (h - th) / 2 - bb[1]), 'Hulhup', font=f, fill=color + (255,))
    return im

A = lambda *p: os.path.join(ROOT, *p)
icon(1024).convert('RGB').save(A('assets/icon/icon.png'))
fg = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0)); mk = Image.new('RGBA', (1024, 1024), (255, 255, 255, 255)); mk.putalpha(mark_mask(1024, 0.78)); fg.alpha_composite(mk)
fg.save(A('assets/icon/foreground.png'))
for name in ('logo.png', 'logo_dark.png'): icon(512, True, 1.0).save(A('assets/splash', name))
for name in ('logo12.png', 'logo12_dark.png'):
    base = Image.new('RGBA', (1152, 1152), (0, 0, 0, 0)); s = int(1152 * 0.62); ic = icon(s, True); base.alpha_composite(ic, ((1152 - s) // 2, (1152 - s) // 2)); base.save(A('assets/splash', name))
wordmark((17, 17, 17)).save(A('assets/splash/brand.png')); wordmark((242, 242, 242)).save(A('assets/splash/brand_dark.png'))
for d, n in (('mdpi', 24), ('hdpi', 36), ('xhdpi', 48), ('xxhdpi', 72), ('xxxhdpi', 96)):
    flat_mark(n * 4, (255, 255, 255), 1.45).resize((n, n), Image.LANCZOS).save(A(f'tool/android_res/drawable-{d}/ic_stat_hulhup.png'))
icon(192, True).save(A('tool/android_res/drawable-xxhdpi/hulhup_large.png'))
if SITE:
    icon(192, True).save(os.path.join(SITE, 'favicon.png')); icon(48, True).save(os.path.join(SITE, 'favicon-48.png'))
    icon(64, True).save(os.path.join(SITE, 'favicon.ico'), sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
S = '/tmp/claude-0/-home-claude/36f0f3e7-08c3-52ef-97ce-8a8582d0a321/scratchpad/logo/'
icon(512, True).save(S + 'preview.png')
