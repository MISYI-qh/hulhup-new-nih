"""Membuat semua aset logo Hulhup dari satu bentuk: dua mata yang mengintip dari balik dinding (datar, ungu).
Pakai: python3 tool/make_logo.py <folder site>  (folder site opsional, untuk favicon)."""
import os, sys
from PIL import Image, ImageDraw, ImageChops
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = sys.argv[1] if len(sys.argv) > 1 else None
BRAND = (0x5B, 0x47, 0xF5)
DEEP = (0x43, 0x30, 0xD0)   # dinding
INK = (0x0B, 0x0B, 0x0B)
WHITE = (255, 255, 255)
SS = 4

# Satuan: u = lebar tanda / 0.72. Pusat tanda di (0,0).
EYE_X, EYE_Y, EYE_RX, EYE_RY = .15, -.06, .125, .15
PUP_R, PUP_DX, PUP_DY = .055, .022, -.035
WALL = (-.36, .0, .36, .21, .07)  # x0, y0, x1, y1, radius

def shapes(n, width_frac, gap=0.0):
    """Topeng (mata, pupil, dinding) pada kanvas n x n; width_frac = lebar tanda dibanding kanvas."""
    N = n * SS; u = N * width_frac / .72; c = N / 2
    X = lambda v: c + v * u; Y = lambda v: c + v * u
    eyes = Image.new('L', (N, N), 0); pup = Image.new('L', (N, N), 0); wall = Image.new('L', (N, N), 0)
    de, dp, dw = ImageDraw.Draw(eyes), ImageDraw.Draw(pup), ImageDraw.Draw(wall)
    for s in (-1, 1):
        de.ellipse((X(s * EYE_X - EYE_RX), Y(EYE_Y - EYE_RY), X(s * EYE_X + EYE_RX), Y(EYE_Y + EYE_RY)), fill=255)
        px, py = s * EYE_X + PUP_DX, EYE_Y + PUP_DY
        dp.ellipse((X(px - PUP_R), Y(py - PUP_R), X(px + PUP_R), Y(py + PUP_R)), fill=255)
    x0, y0, x1, y1, r = WALL
    dw.rounded_rectangle((X(x0), Y(y0), X(x1), Y(y1)), radius=r * u, fill=255)
    if gap:
        halo = Image.new('L', (N, N), 0)
        ImageDraw.Draw(halo).rounded_rectangle((X(x0 - gap), Y(y0 - gap), X(x1 + gap), Y(y1)), radius=(r + gap) * u, fill=255)
        eyes = ImageChops.subtract(eyes, halo)
        pup = ImageChops.subtract(pup, halo)
    rs = lambda m: m.resize((n, n), Image.LANCZOS)
    return rs(eyes), rs(pup), rs(wall)

def mark(n, width_frac, eye_c, pupil_c, wall_c, silhouette=False):
    """silhouette=True: satu warna (eye_c), pupil berlubang dan ada celah di antara mata dan dinding (ikon notifikasi)."""
    eyes, pup, wall = shapes(n, width_frac, gap=.035 if silhouette else 0)
    out = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    def layer(mask, col):
        a = Image.new('RGBA', (n, n), col + (255,)); a.putalpha(mask); out.alpha_composite(a)
    if silhouette:
        layer(ImageChops.subtract(eyes, pup), eye_c); layer(wall, eye_c)
    else:
        layer(eyes, eye_c); layer(pup, pupil_c); layer(wall, wall_c)
    return out

def squircle(n, r=0.225):
    m = Image.new('L', (n * SS, n * SS), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, n * SS - 1, n * SS - 1), radius=int(r * n * SS), fill=255)
    return m.resize((n, n), Image.LANCZOS)

def tile(n, width_frac=0.60, rounded=True):
    out = Image.new('RGBA', (n, n), BRAND + (255,))
    out.alpha_composite(mark(n, width_frac, WHITE, BRAND, DEEP))
    if rounded: out.putalpha(squircle(n))
    return out

A = lambda *p: os.path.join(ROOT, *p)
tile(1024, 0.60, False).convert('RGB').save(A('assets/icon/icon.png'))
mark(1024, 0.50, WHITE, BRAND, DEEP).save(A('assets/icon/foreground.png'))
# Splash: tanda saja tanpa bingkai di layar polos, warna logo tetap. Terang: mata ungu, pupil putih, dinding ungu tua. Gelap: mata putih, pupil ungu, dinding ungu.
LIGHT, DARK = ((BRAND, WHITE), DEEP), ((WHITE, BRAND), BRAND)
for name, ((eye, pup), wall) in (('logo.png', LIGHT), ('logo_dark.png', DARK)):
    mark(512, 0.80, eye, pup, wall).save(A('assets/splash', name))
for name, ((eye, pup), wall) in (('logo12.png', LIGHT), ('logo12_dark.png', DARK)):
    mark(1152, 0.46, eye, pup, wall).save(A('assets/splash', name))
for d, n in (('mdpi', 24), ('hdpi', 36), ('xhdpi', 48), ('xxhdpi', 72), ('xxxhdpi', 96)):
    mark(n * 4, 0.92, WHITE, None, None, silhouette=True).resize((n, n), Image.LANCZOS).save(A(f'tool/android_res/drawable-{d}/ic_stat_hulhup.png'))
tile(192).save(A('tool/android_res/drawable-xxhdpi/hulhup_large.png'))
if SITE:
    tile(192).save(os.path.join(SITE, 'favicon.png')); tile(48).save(os.path.join(SITE, 'favicon-48.png'))
    tile(64).save(os.path.join(SITE, 'favicon.ico'), sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
S = '/tmp/claude-0/-home-claude/36f0f3e7-08c3-52ef-97ce-8a8582d0a321/scratchpad/logo/'
sheet = Image.new('RGB', (1500, 512), (255, 255, 255))
t = tile(512); sheet.paste(t, (0, 0), t)
nt = Image.new('RGBA', (512, 512), (255, 255, 255, 255)); nt.alpha_composite(Image.new('RGBA', (512, 512), (0x33, 0x33, 0x33, 255))); nt.alpha_composite(mark(512, 0.9, WHITE, None, None, silhouette=True)); sheet.paste(nt.convert('RGB'), (540, 0))
sm = Image.new('RGB', (420, 512), (255, 255, 255)); s2 = tile(96); sm.paste(s2, (20, 20), s2); s3 = tile(48); sm.paste(s3, (140, 44), s3); s4 = tile(32); sm.paste(s4, (210, 52), s4)
sheet.paste(sm, (1080, 0)); sheet.save(S + 'preview.png')
