"""Ambil tabel terjemahan S dari lib/core.dart ke web/content/i18n.json (jalankan ulang bila teks berubah)."""
import re, json, sys
src = open('lib/core.dart', encoding='utf-8').read()
i = src.index('const S = <String, List<String>>{')
body = src[i:]
j = body.index('\n};')
body = body[:j]
def lit(s, p):
    q = s[p]; assert q in '\'"', s[p:p+30]
    out = []; p += 1
    while s[p] != q:
        if s[p] == '\\':
            n = s[p+1]; out.append({'n': '\n', 't': '\t'}.get(n, n)); p += 2
        else: out.append(s[p]); p += 1
    return ''.join(out), p + 1
res = {}; p = body.index('{') + 1
while True:
    m = re.compile(r'\s*,?\s*').match(body, p); p = m.end()
    if p >= len(body): break
    k, p = lit(body, p)
    p = re.compile(r'\s*:\s*\[\s*').match(body, p).end()
    a, p = lit(body, p)
    p = re.compile(r'\s*,\s*').match(body, p).end()
    b, p = lit(body, p)
    p = re.compile(r'\s*,?\s*\]').match(body, p).end()
    res[k] = [a, b]
json.dump(res, open('web/content/i18n.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
print(len(res), 'kunci')
