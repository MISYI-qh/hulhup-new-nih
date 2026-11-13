import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';
import 'core.dart';
import 'extra.dart';
import 'hups.dart' show FileBar;
import 'pages.dart' show ImageViewer;
import 'ui.dart';

/// Tautan pertama di teks post (tanpa tanda baca di ujung), atau null.
String? firstUrl(String text) {
  for (final m in linkRe.allMatches(text)) {
    final u = trimLink(m.group(0)!);
    if (u.isEmpty || u.startsWith('@')) continue;
    final uri = linkUri(u);
    if (uri != null) return uri.toString();
  }
  return null;
}

enum UrlKind { image, video, audio, page }

final _imgRe = RegExp(r'\.(jpe?g|png|gif|webp|avif|bmp|svg)$', caseSensitive: false);
final _vidRe = RegExp(r'\.(mp4|webm|mov|m4v|ogv)$', caseSensitive: false);
final _audRe = RegExp(r'\.(mp3|m4a|aac|ogg|oga|opus|wav|flac)$', caseSensitive: false);

/// Jenis tautan menurut ekstensi; yang tidak jelas ditanyakan ke server (lihat Store.preview).
UrlKind kindOfUrl(String url) {
  final p = Uri.tryParse(url)?.path ?? '';
  if (_imgRe.hasMatch(p)) return UrlKind.image;
  if (_vidRe.hasMatch(p)) return UrlKind.video;
  if (_audRe.hasMatch(p)) return UrlKind.audio;
  return UrlKind.page;
}

/// Gambar dari situs luar dimuat lewat server Hulhup (alamat bertanda tangan), supaya situs asal tidak melihat IP pengguna.
String proxied(String s) => s.startsWith('/') ? '${Api.base}$s' : s;

/// Cache pratinjau di memori: hanya URL yang disimpan di post, sisanya diambil saat dilihat.
final _previews = <String, Future<Map?>>{};
Future<Map?> fetchPreview(String url) => _previews.putIfAbsent(url, () async {
      final s = Store.i;
      if (s.me == null) return null;
      try {
        final j = await Api.req('GET', '/preview?url=${Uri.encodeQueryComponent(url)}');
        final p = j['preview'];
        return p is Map ? p : null;
      } catch (_) {
        _previews.remove(url);
        return null;
      }
    });

/// Tampilan otomatis untuk tautan di post: gambar, video, audio, atau kartu halaman. Tanpa perlu mengetuk tautannya.
class LinkEmbed extends StatelessWidget {
  final String url;
  const LinkEmbed(this.url, {super.key});

  @override
  Widget build(BuildContext context) {
    final k = kindOfUrl(url);
    final host = Uri.tryParse(url)?.host.replaceFirst('www.', '') ?? '';
    if (k == UrlKind.video) return _VideoEmbed(url);
    if (k == UrlKind.audio) return _AudioEmbed(url, host);
    return FutureBuilder<Map?>(
      future: fetchPreview(url),
      builder: (context, snap) {
        final p = snap.data;
        if (p == null) return const SizedBox();
        switch ('${p['kind']}') {
          case 'image': return _ImageEmbed(proxied('${p['src']}'), orig: '${p['url']}');
          case 'video': return _VideoEmbed('${p['url']}');
          case 'audio': return _AudioEmbed('${p['url']}', host);
        }
        return _PageCard(url, p);
      },
    );
  }
}

class _PageCard extends StatelessWidget {
  final String url;
  final Map p;
  const _PageCard(this.url, this.p);
  @override
  Widget build(BuildContext context) {
    final img = proxied('${p['image'] ?? ''}'), icon = proxied('${p['icon'] ?? ''}'), title = '${p['title'] ?? ''}', desc = '${p['desc'] ?? ''}', site = '${p['site'] ?? p['host'] ?? ''}';
    final host = '${p['host'] ?? ''}';
    return Tap(
      onTap: () => openLink(context, url), scale: .985,
      child: Container(
        margin: const EdgeInsets.only(top: 10, right: 8),
        decoration: BoxDecoration(borderRadius: BorderRadius.circular(20), border: Border.all(color: ink(context).withValues(alpha: .1)), color: soft(context)),
        clipBehavior: Clip.antiAlias,
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          if (img.isNotEmpty) AspectRatio(aspectRatio: 1.91, child: Image.network(img, fit: BoxFit.cover, width: double.infinity,
            errorBuilder: (_, __, ___) => const SizedBox(), loadingBuilder: (_, c, pr) => pr == null ? c : Container(color: ink(context).withValues(alpha: .05)))),
          Padding(padding: const EdgeInsets.fromLTRB(14, 10, 14, 12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              if (icon.isNotEmpty) Padding(padding: const EdgeInsets.only(right: 6), child: ClipRRect(borderRadius: BorderRadius.circular(4), child: Image.network(icon, width: 14, height: 14, errorBuilder: (_, __, ___) => const SizedBox(width: 14, height: 14)))),
              Expanded(child: Text(site.isEmpty ? host : site, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: sub(context), fontSize: 12.5, fontWeight: FontWeight.w600))),
            ]),
            if (title.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 4), child: Text(title, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, height: 1.25))),
            if (desc.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 3), child: Text(desc, maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(color: sub(context), fontSize: 13.5, height: 1.3))),
          ])),
        ]),
      ),
    );
  }
}

class _ImageEmbed extends StatelessWidget {
  final String url, orig;
  const _ImageEmbed(this.url, {this.orig = ''});
  @override
  Widget build(BuildContext context) => Tap(
        onTap: () => go(context, ImageViewer(url, Uri.tryParse(orig.isEmpty ? url : orig)?.host ?? '')), scale: .99,
        child: Container(
          margin: const EdgeInsets.only(top: 10, right: 8), constraints: const BoxConstraints(maxHeight: 420),
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(20), border: Border.all(color: ink(context).withValues(alpha: .08))),
          clipBehavior: Clip.antiAlias,
          child: Image.network(url, fit: BoxFit.cover, width: double.infinity,
            errorBuilder: (_, __, ___) => Padding(padding: const EdgeInsets.all(14), child: Row(children: [Icon(Icons.broken_image_outlined, color: sub(context)), const SizedBox(width: 10), Expanded(child: Text(Uri.tryParse(url)?.host ?? url, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: sub(context))))])),
            loadingBuilder: (_, c, pr) => pr == null ? c : AspectRatio(aspectRatio: 1.6, child: Container(color: ink(context).withValues(alpha: .05)))),
        ),
      );
}

/// Video dari URL: tidak diunduh sampai diketuk (hemat kuota), lalu langsung diputar di tempat.
class _VideoEmbed extends StatefulWidget {
  final String url;
  const _VideoEmbed(this.url);
  @override
  State<_VideoEmbed> createState() => _VideoState();
}

class _VideoState extends State<_VideoEmbed> {
  VideoPlayerController? c;
  bool failed = false;

  Future<void> _start() async {
    final s = Store.i;
    try { await s.stop(); } catch (_) {}
    final v = VideoPlayerController.networkUrl(Uri.parse(widget.url));
    setState(() => c = v);
    try {
      await v.initialize();
      await v.setLooping(true);
      await v.play();
      if (mounted) setState(() {});
    } catch (_) {
      if (mounted) setState(() { failed = true; c = null; });
      v.dispose();
    }
  }

  @override
  void dispose() { c?.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) {
    final v = c, ok = v != null && v.value.isInitialized;
    final ratio = ok ? v.value.aspectRatio.clamp(.5, 2.2) : 16 / 9;
    return Container(
      margin: const EdgeInsets.only(top: 10, right: 8),
      decoration: BoxDecoration(borderRadius: BorderRadius.circular(20), color: Colors.black),
      clipBehavior: Clip.antiAlias,
      child: AspectRatio(aspectRatio: ratio.toDouble(), child: Stack(alignment: Alignment.center, children: [
        if (v == null && !failed) Positioned(left: 14, right: 14, bottom: 10, child: Text(Store.i.t('ext_note').replaceAll('{h}', Uri.tryParse(widget.url)?.host.replaceFirst('www.', '') ?? ''), textAlign: TextAlign.center, style: const TextStyle(color: Colors.white60, fontSize: 11.5))),
        if (ok) Positioned.fill(child: VideoPlayer(v)),
        if (failed) Tap(onTap: () => openLink(context, widget.url), child: const Icon(Icons.open_in_new_rounded, color: Colors.white70, size: 34))
        else if (v == null) Tap(onTap: _start, child: Container(width: 58, height: 58, decoration: const BoxDecoration(color: Colors.white24, shape: BoxShape.circle), child: const Icon(Icons.play_arrow_rounded, color: Colors.white, size: 38)))
        else if (!ok) const SizedBox(width: 26, height: 26, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white70))
        else Positioned.fill(child: GestureDetector(behavior: HitTestBehavior.opaque, onTap: () { setState(() { v.value.isPlaying ? v.pause() : v.play(); }); }, child: v.value.isPlaying ? const SizedBox() : const Center(child: Icon(Icons.play_arrow_rounded, color: Colors.white70, size: 54)))),
      ])),
    );
  }
}

/// Audio dari URL: memakai pemutar Hulhup yang sama (satu suara pada satu waktu).
class _AudioEmbed extends StatelessWidget {
  final String url, host;
  const _AudioEmbed(this.url, this.host);
  @override
  Widget build(BuildContext context) {
    final key = -(url.hashCode & 0x3fffffff) - 1000;
    final name = Uri.decodeComponent(Uri.tryParse(url)?.pathSegments.lastOrNull ?? host);
    return Padding(padding: const EdgeInsets.only(right: 8), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      FileBar(key, url, 0),
      Padding(padding: const EdgeInsets.fromLTRB(6, 4, 0, 0), child: Text('$name · ${Store.i.t('ext_note').replaceAll('{h}', host)}', maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(color: sub(context), fontSize: 11.5))),
    ]));
  }
}
