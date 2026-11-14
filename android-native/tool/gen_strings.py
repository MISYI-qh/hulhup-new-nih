"""Mengubah peta teks S di lib/core.dart menjadi Strings.kt (Kotlin). Jalankan ulang bila teks berubah."""
import re, sys, pathlib
root = pathlib.Path(__file__).resolve().parents[2]
src = (root / 'lib/core.dart').read_text()
start = src.index('const S = <String, List<String>>{')
body = src[start + len('const S = <String, List<String>>{'):]
body = body[:body.index('\n};')]
i, n, toks = 0, len(body), []
def unesc(s):
    out, j = [], 0
    while j < len(s):
        c = s[j]
        if c == '\\' and j + 1 < len(s):
            d = s[j + 1]; j += 2
            out.append({'n': '\n', 't': '\t', "'": "'", '"': '"', '\\': '\\', '$': '$'}.get(d, d))
        else:
            out.append(c); j += 1
    return ''.join(out)
while i < n:
    c = body[i]
    if c in '\'"':
        q, j, buf = c, i + 1, []
        while body[j] != q:
            if body[j] == '\\': buf.append(body[j:j + 2]); j += 2
            else: buf.append(body[j]); j += 1
        toks.append(('s', unesc(''.join(buf)))); i = j + 1
    elif c in '[]:,':
        toks.append((c, c)); i += 1
    elif body.startswith('//', i):
        i = body.index('\n', i)
    else:
        i += 1
pairs, k = [], 0
while k < len(toks):
    if toks[k][0] == 's' and toks[k + 1][0] == ':' and toks[k + 2][0] == '[':
        key = toks[k][1]; vals = []; k += 3
        while toks[k][0] != ']':
            if toks[k][0] == 's': vals.append(toks[k][1])
            k += 1
        k += 1
        assert len(vals) == 2, (key, vals)
        pairs.append((key, vals))
    else:
        k += 1
def kq(s):
    return '"' + s.replace('\\', '\\\\').replace('"', '\\"').replace('$', '\\$').replace('\n', '\\n').replace('\t', '\\t') + '"'
out = ['// DIHASILKAN oleh tool/gen_strings.py dari lib/core.dart (peta S). Jangan diubah tangan.', 'package app.misyi.hulhup', '', 'object Strings {', '    val S: Map<String, List<String>> = mapOf(']
for key, v in pairs:
    out.append(f'        {kq(key)} to listOf({kq(v[0])}, {kq(v[1])}),')
out += ['    )', '}', '']
dst = root / 'android-native/app/src/main/java/app/misyi/hulhup/Strings.kt'
dst.parent.mkdir(parents=True, exist_ok=True)
dst.write_text('\n'.join(out))
print(len(pairs), 'teks')
