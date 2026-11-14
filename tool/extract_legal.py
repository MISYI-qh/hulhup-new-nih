"""Mengambil teks Tentang/Ketentuan/Privasi/FAQ dari aplikasi lama (Dart) menjadi data untuk web Next.js."""
import re, json, sys
core = open('lib/core.dart', encoding='utf8').read()
extra = open('lib/extra.dart', encoding='utf8').read()
lit = r"'((?:[^'\\]|\\.)*)'"
def unesc(s): return re.sub(r"\\(.)", lambda m: {'n': '\n', 't': '\t'}.get(m.group(1), m.group(1)), s)
def pair(k):
    m = re.search(r"'%s': \[\s*%s,\s*%s" % (k, lit, lit), core)
    return [unesc(m.group(1)), unesc(m.group(2))]
out = {k: pair(k + '_t') for k in ('about', 'policy', 'privacy')}
def faq(name):
    m = re.search(r"static const _%s = \[(.*?)\n  \];" % name, extra, re.S)
    return [[unesc(a), unesc(b)] for a, b in re.findall(r"\(\s*%s,\s*%s\)" % (lit, lit), m.group(1))]
out['faq'] = {'id': faq('id'), 'en': faq('en')}
json.dump(out, open('web/content/legal.json', 'w', encoding='utf8'), ensure_ascii=False, indent=1)
print({k: (len(v) if isinstance(v, list) else {a: len(b) for a, b in v.items()}) for k, v in out.items()})
