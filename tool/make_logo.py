"""Membuat semua aset logo Hulhup dari satu bentuk: wajah bulat yang berseru "hups!" (datar, satu warna).
Pakai: python3 tool/make_logo.py <folder site>  (folder site opsional, untuk favicon)."""
import os, sys
from PIL import Image, ImageDraw
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = sys.argv[1] if len(sys.argv) > 1 else None
BRAND = (0x5B, 0x47, 0xF5)
INK = (0x0B, 0x0B, 0x0B)
WHITE = (255, 255, 255)
SS = 4

def head_mask(n, scale):
    N = n * SS; D = N * scale; c = N / 2
    m = Image.new('L', (N, N), 0); ImageDraw.Draw(m).ellipse((c - D / 2, c - D / 2, c + D / 2, c + D / 2), fill=255)
    return m.resize((n, n), Image.LANCZOS)

def face_mask(n, scale):
    N = n * SS; D = N * scale; c = N / 2
    m = Image.new('L', (N, N), 0); d = ImageDraw.Draw(m)
    for sx in (-1, 1):  # mata
        ex, ey = c + sx * .15 * D, c - .08 * D
        d.ellipse((ex - .05 * D, ey - .07 * D, ex + .05 * D, ey + .07 * D), fill=255)
    mx, my = c, c + .17 * D  # mulut terbuka
    d.ellipse((mx - .11 * D, my - .14 * D, mx + .11 * D, my + .14 * D), fill=255)
    return m.resize((n, n), Image.LANCZOS)

def mark(n, scale, head_c, face_c=None):
    """face_c None = wajah berlubang (transparan), dipakai untuk ikon notifikasi."""
    hm, fm = head_mask(n, scale), face_mask(n, scale)
    out = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    a = Image.new('RGBA', (n, n), head_c + (255,))
    if face_c is None:
        from PIL import ImageChops
        hm = ImageChops.subtract(hm, fm)
    a.putalpha(hm); out.alpha_composite(a)
    if face_c is not None:
        b = Image.new('RGBA', (n, n), face_c + (255,)); b.putalpha(fm); out.alpha_composite(b)
    return out

def squircle(n, r=0.225):
    m = Image.new('L', (n * SS, n * SS), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, n * SS - 1, n * SS - 1), radius=int(r * n * SS), fill=255)
    return m.resize((n, n), Image.LANCZOS)

def icon(n, rounded=False, scale=0.60):
    out = Image.new('RGBA', (n, n), BRAND + (255,))
    out.alpha_composite(mark(n, scale, WHITE, BRAND))
    if rounded: out.putalpha(squircle(n))
    return out

A = lambda *p: os.path.join(ROOT, *p)
icon(1024).convert('RGB').save(A('assets/icon/icon.png'))
mark(1024, 0.52, WHITE, BRAND).save(A('assets/icon/foreground.png'))
mark(512, 0.7, BRAND, WHITE).save(A('assets/splash/logo.png'))
mark(512, 0.7, BRAND, INK).save(A('assets/splash/logo_dark.png'))
mark(1152, 0.40, BRAND, WHITE).save(A('assets/splash/logo12.png'))
mark(1152, 0.40, BRAND, INK).save(A('assets/splash/logo12_dark.png'))
for d, n in (('mdpi', 24), ('hdpi', 36), ('xhdpi', 48), ('xxhdpi', 72), ('xxxhdpi', 96)):
    mark(n * 4, 0.92, WHITE, None).resize((n, n), Image.LANCZOS).save(A(f'tool/android_res/drawable-{d}/ic_stat_hulhup.png'))
icon(192, True).save(A('tool/android_res/drawable-xxhdpi/hulhup_large.png'))
if SITE:
    icon(192, True).save(os.path.join(SITE, 'favicon.png')); icon(48, True).save(os.path.join(SITE, 'favicon-48.png'))
    icon(64, True).save(os.path.join(SITE, 'favicon.ico'), sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
S = '/tmp/claude-0/-home-claude/36f0f3e7-08c3-52ef-97ce-8a8582d0a321/scratchpad/logo/'
sheet = Image.new('RGB', (1100, 512), (255, 255, 255))
i = icon(512, True); sheet.paste(i, (0, 0), i)
sp = Image.new('RGBA', (512, 512), (255, 255, 255, 255)); sp.alpha_composite(mark(512, 0.7, BRAND, WHITE)); sheet.paste(sp.convert('RGB'), (540, 0))
sheet.save(S + 'preview.png')
