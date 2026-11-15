# Hasilkan web/lib/icons.ts (path SVG Material) untuk ikon yang dipakai di lib/*.dart.
import re, glob, os, json
base = '/tmp/ic/node_modules/@material-design-icons/svg'
names = sorted({m for f in glob.glob('lib/*.dart') for m in re.findall(r'Icons\.([a-z0-9_]+)', open(f).read())})
out = {}
for n in names:
    for suf, d in (('_rounded', 'round'), ('_outlined', 'outlined')):
        if n.endswith(suf):
            key = n[:-len(suf)]; p = f'{base}/{d}/{key}.svg'
            if os.path.exists(p):
                s = open(p).read(); inner = re.search(r'<svg[^>]*>(.*)</svg>', s, re.S).group(1)
                out[n] = inner; break
    else:
        alt = {'info_outline_rounded': 'info', 'label_outline_rounded': 'label', 'lock_outline_rounded': 'lock'}.get(n)
        p = f'{base}/outlined/{alt}.svg' if alt else ''
        if alt and os.path.exists(p):
            out[n] = re.search(r'<svg[^>]*>(.*)</svg>', open(p).read(), re.S).group(1)
        else:
            print('skip', n)
open('web/lib/icons.ts', 'w').write('// dihasilkan oleh tool/gen_icons.py\nexport const ICONS: Record<string, string> = ' + json.dumps(out) + ';\n')
print(len(out), len(names))
