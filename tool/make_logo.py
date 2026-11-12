"""Membuat semua aset logo Hulhup dari satu bentuk: cangkir "u" dengan bola yang meloncat masuk (hup!).
Pakai: python3 tool/make_logo.py <folder site>  (folder site opsional, untuk favicon)."""
import os, sys
from PIL import Image, ImageDraw
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = sys.argv[1] if len(sys.argv) > 1 else None
INK = (0x0B, 0x0B, 0x0B)
YELLOW = (0xFF, 0xC4, 0x00)
WHITE = (255, 255, 255)
SS = 4
CX, CY = 0.5, 0.462  # pusat tanda (satuan 0..1)

def layers(n, scale=1.0):
    """Mengembalikan (topeng cangkir, topeng bola) berukuran n x n."""
    N = n * SS
    def P(v, c): return 0.5 * N + (v - c) * N * scale
    X = lambda v: P(v, CX); Y = lambda v: P(v, CY)
    cup = Image.new('L', (N, N), 0); d = ImageDraw.Draw(cup)
    d.ellipse((X(.225), Y(.325), X(.775), Y(.875)), fill=255)
    d.ellipse((X(.375), Y(.475), X(.625), Y(.725)), fill=0)
    d.rectangle((0, 0, N, Y(.60)), fill=0)
    r = (X(.375) - X(.225)) / 2
    for x0, x1 in ((.225, .375), (.625, .775)):
        d.rounded_rectangle((X(x0), Y(.36), X(x1), Y(.58)), radius=r, fill=255)
        d.rectangle((X(x0), Y(.50), X(x1), Y(.605)), fill=255)
    ball = Image.new('L', (N, N), 0)
    ImageDraw.Draw(ball).ellipse((X(.5 - .10), Y(.17 - .10), X(.5 + .10), Y(.17 + .10)), fill=255)
    return cup.resize((n, n), Image.LANCZOS), ball.resize((n, n), Image.LANCZOS)

def mark(n, scale, cup_c, ball_c):
    cup, ball = layers(n, scale)
    out = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    a = Image.new('RGBA', (n, n), cup_c + (255,)); a.putalpha(cup); out.alpha_composite(a)
    b = Image.new('RGBA', (n, n), ball_c + (255,)); b.putalpha(ball); out.alpha_composite(b)
    return out

def squircle(n, r=0.225):
    m = Image.new('L', (n * SS, n * SS), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, n * SS - 1, n * SS - 1), radius=int(r * n * SS), fill=255)
    return m.resize((n, n), Image.LANCZOS)

def icon(n, rounded=False, scale=0.66):
    out = Image.new('RGBA', (n, n), INK + (255,))
    out.alpha_composite(mark(n, scale, WHITE, YELLOW))
    if rounded: out.putalpha(squircle(n))
    return out

A = lambda *p: os.path.join(ROOT, *p)
icon(1024).convert('RGB').save(A('assets/icon/icon.png'))
mark(1024, 0.56, WHITE, YELLOW).save(A('assets/icon/foreground.png'))
mark(512, 0.9, INK, YELLOW).save(A('assets/splash/logo.png'))
mark(512, 0.9, WHITE, YELLOW).save(A('assets/splash/logo_dark.png'))
for name, c in (('logo12.png', INK), ('logo12_dark.png', WHITE)):
    mark(1152, 0.5, c, YELLOW).save(A('assets/splash', name))
for f in ('brand.png', 'brand_dark.png'):
    if os.path.exists(A('assets/splash', f)): os.remove(A('assets/splash', f))
for d, n in (('mdpi', 24), ('hdpi', 36), ('xhdpi', 48), ('xxhdpi', 72), ('xxxhdpi', 96)):
    mark(n * 4, 1.1, WHITE, WHITE).resize((n, n), Image.LANCZOS).save(A(f'tool/android_res/drawable-{d}/ic_stat_hulhup.png'))
icon(192, True).save(A('tool/android_res/drawable-xxhdpi/hulhup_large.png'))
if SITE:
    icon(192, True).save(os.path.join(SITE, 'favicon.png')); icon(48, True).save(os.path.join(SITE, 'favicon-48.png'))
    icon(64, True).save(os.path.join(SITE, 'favicon.ico'), sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
S = '/tmp/claude-0/-home-claude/36f0f3e7-08c3-52ef-97ce-8a8582d0a321/scratchpad/logo/'
sheet = Image.new('RGB', (1100, 512), (255, 255, 255))
sheet.paste(icon(512, True), (0, 0), icon(512, True))
sp = Image.new('RGBA', (512, 512), (255, 255, 255, 255)); sp.alpha_composite(mark(512, 0.9, INK, YELLOW)); sheet.paste(sp.convert('RGB'), (540, 0))
sheet.save(S + 'preview.png')
