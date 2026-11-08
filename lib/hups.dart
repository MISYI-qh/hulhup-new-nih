// Hups: tulisan tanpa batas, banyak audio, komentar bersarang, simpan, bagikan.
import 'dart:async';
import 'package:audioplayers/audioplayers.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';
import 'package:share_plus/share_plus.dart';
import 'core.dart';
import 'pages.dart';
import 'ui.dart';

String postLink(int id) => 'https://hulhup.my.id/p/$id';

Future<void> sharePost(A a) async {
  final s = Store.i;
  final head = a.desc.trim().isEmpty ? '' : '${a.desc.trim()}${a.long ? '…' : ''}\n\n';
  final text = '$head${postLink(a.id)}';
  try {
    await Share.share(text, subject: 'Hulhup');
  } catch (_) {
    await Clipboard.setData(ClipboardData(text: postLink(a.id)));
    toast(s.t('link_copied'));
  }
}

Future<void> savePost(A a) async {
  final s = Store.i;
  if (s.me == null) { toast(s.t('need_login')); return; }
  try {
    final j = await Api.req('POST', '/audios/${a.id}/save');
    a.saved = j['saved'] == true;
    s.poke();
    toast(s.t(a.saved ? 'saved_post' : 'unsaved_post'));
  } catch (e) { toast(s.err(e), bad: true); }
}

Future<void> openPost(BuildContext c, A a) => go(c, PostPage(a.id, seed: a));

/// Satu klip audio yang direkam atau dipilih (maksimal 15 detik).
class AudioClip {
  final Uint8List bytes;
  final String ext;
  final int ms;
  AudioClip(this.bytes, this.ext, this.ms);
  int get secs => (ms / 1000).ceil().clamp(1, 15);
}

// ---------- perekam (lembar bawah) ----------
class RecordSheet extends StatefulWidget {
  const RecordSheet({super.key});
  @override
  State<RecordSheet> createState() => _RecordSheetState();
}

class _RecordSheetState extends State<RecordSheet> {
  final rec = AudioRecorder();
  final pv = AudioPlayer();
  Uint8List? bytes;
  String ext = 'm4a';
  int ms = 0;
  bool recording = false, previewing = false;
  Timer? timer;

  @override
  void initState() { super.initState(); pv.onPlayerComplete.listen((_) { if (mounted) setState(() => previewing = false); }); }
  @override
  void dispose() { timer?.cancel(); rec.dispose(); pv.dispose(); super.dispose(); }

  Future<void> _rec() async {
    if (recording) return _stop();
    final s = Store.i;
    try {
      if (!await rec.hasPermission()) { toast(s.t('mic_denied'), bad: true); return; }
      final p = kIsWeb ? '' : '${(await getTemporaryDirectory()).path}/h${DateTime.now().millisecondsSinceEpoch}.m4a';
      await rec.start(kIsWeb ? const RecordConfig(encoder: AudioEncoder.wav, numChannels: 1, sampleRate: 16000) : const RecordConfig(encoder: AudioEncoder.aacLc, numChannels: 1), path: p);
      await pv.stop();
      setState(() { recording = true; ms = 0; bytes = null; previewing = false; });
      final t0 = DateTime.now();
      timer = Timer.periodic(const Duration(milliseconds: 100), (_) { setState(() => ms = (DateTime.now().difference(t0).inMilliseconds).clamp(0, 15000)); if (ms >= 15000) _stop(); });
    } catch (_) { toast(s.t('e_server'), bad: true); }
  }

  Future<void> _stop() async {
    timer?.cancel();
    final p = await rec.stop();
    ext = kIsWeb ? 'wav' : 'm4a';
    Uint8List? b;
    if (p != null) { try { b = await XFile(p).readAsBytes(); } catch (_) {} }
    if (mounted) setState(() { recording = false; bytes = b; });
  }

  Future<void> _pick() async {
    final s = Store.i;
    final r = await FilePicker.platform.pickFiles(type: FileType.audio, withData: kIsWeb);
    final f = r?.files.single;
    if (f == null) return;
    if (f.size > 3 * 1024 * 1024) { toast(s.t('e_too_big'), bad: true); return; }
    final b = f.bytes ?? await XFile(f.path!).readAsBytes();
    final tp = AudioPlayer();
    int? secs;
    try {
      await tp.setSource(BytesSource(b, mimeType: mimeOf(b)));
      for (var i = 0; i < 10 && secs == null; i++) {
        final d = await tp.getDuration();
        if (d != null) { secs = (d.inMilliseconds / 1000).round(); } else { await Future.delayed(const Duration(milliseconds: 150)); }
      }
    } catch (_) {}
    await tp.dispose();
    if (secs == null) { toast(s.t('e_bad_file'), bad: true); return; }
    if (secs > 15) { toast(s.t('too_long'), bad: true); return; }
    await pv.stop();
    final sv = secs;
    setState(() { bytes = b; ext = (f.extension ?? 'm4a').toLowerCase(); ms = (sv < 1 ? 1 : sv) * 1000; previewing = false; });
  }

  Future<void> _preview() async {
    if (bytes == null) return;
    if (previewing) { await pv.stop(); setState(() => previewing = false); return; }
    setState(() => previewing = true);
    await pv.play(BytesSource(bytes!, mimeType: mimeOf(bytes!)));
  }

  @override
  Widget build(BuildContext context) {
    final s = Store.i;
    return Column(mainAxisSize: MainAxisSize.min, children: [
      Text(s.t('rec_title'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
      const SizedBox(height: 18),
      Tap(onTap: _rec, child: AnimatedContainer(duration: const Duration(milliseconds: 300), curve: Curves.easeOutCubic, width: recording ? 84 : 112, height: recording ? 84 : 112, decoration: BoxDecoration(color: recording ? heart : green, borderRadius: BorderRadius.circular(recording ? 26 : 56), boxShadow: [BoxShadow(color: (recording ? heart : green).withValues(alpha: .3), blurRadius: 26, offset: const Offset(0, 10))]), child: Icon(recording ? Icons.stop_rounded : Icons.mic_rounded, color: cream, size: 40))),
      const SizedBox(height: 14),
      Text('${mmss(ms ~/ 1000)} / 0:15', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
      const SizedBox(height: 4),
      Padding(padding: const EdgeInsets.symmetric(horizontal: 8), child: ClipRRect(borderRadius: BorderRadius.circular(4), child: LinearProgressIndicator(value: ms / 15000, minHeight: 5, backgroundColor: ink(context).withValues(alpha: .12), color: recording ? heart : ink(context)))),
      const SizedBox(height: 6),
      Text(s.t('rec_hint'), textAlign: TextAlign.center, style: TextStyle(color: sub(context), fontSize: 13)),
      const SizedBox(height: 16),
      Row(children: [
        Expanded(child: PBtn(s.t('pick'), recording ? null : _pick, ghost: true, icon: Icons.audio_file_outlined)),
        if (bytes != null && !recording) ...[const SizedBox(width: 10), Expanded(child: PBtn(s.t('preview'), _preview, ghost: true, icon: previewing ? Icons.pause_rounded : Icons.play_arrow_rounded))],
      ]),
      const SizedBox(height: 10),
      PBtn(s.t('use_audio'), bytes == null || recording ? null : () => Navigator.pop(context, AudioClip(bytes!, ext, ms)), icon: Icons.check_rounded),
    ]);
  }
}

// ---------- pemutar kecil ----------
int fileKey(A a, int i) => i == 0 ? a.id : -(a.id * 20 + i);

class FileBar extends StatelessWidget {
  final int keyId;
  final String url;
  final int secs;
  final Object? scope;
  const FileBar(this.keyId, this.url, this.secs, {super.key, this.scope});
  @override
  Widget build(BuildContext context) {
    final s = Store.i;
    return ListenableBuilder(listenable: s, builder: (_, __) {
      final on = s.playing == keyId;
      return Container(
        margin: const EdgeInsets.only(top: 8), padding: const EdgeInsets.fromLTRB(6, 6, 14, 6),
        decoration: BoxDecoration(color: soft(context), borderRadius: BorderRadius.circular(24)),
        child: Row(children: [
          Tap(onTap: () => s.playUrl(keyId, url, scope: scope).catchError((_) => toast(s.t('e_server'), bad: true)), child: AnimatedContainer(duration: const Duration(milliseconds: 250), width: 38, height: 38, decoration: BoxDecoration(color: on ? ink(context) : green, shape: BoxShape.circle), child: Icon(on ? Icons.pause_rounded : Icons.play_arrow_rounded, color: on ? bgOf(context) : cream, size: 22))),
          Expanded(child: ValueListenableBuilder<int>(valueListenable: s.pos, builder: (_, ms, __) {
            final total = (on && s.dur > 0 ? s.dur : (secs > 0 ? secs * 1000 : 15000)).clamp(1, 1 << 30);
            return Padding(padding: const EdgeInsets.symmetric(horizontal: 12), child: ClipRRect(borderRadius: BorderRadius.circular(4), child: LinearProgressIndicator(value: on ? (ms / total).clamp(0.0, 1.0) : 0, minHeight: 5, backgroundColor: ink(context).withValues(alpha: .12), color: acc(context))));
          })),
          ValueListenableBuilder<int>(valueListenable: s.pos, builder: (_, ms, __) => Text(on ? mmss(ms ~/ 1000) : (secs > 0 ? mmss(secs) : '·'), style: TextStyle(color: on ? ink(context) : sub(context), fontSize: 12.5, fontWeight: FontWeight.w700))),
        ]),
      );
    });
  }
}

class OwnerRow extends StatelessWidget {
  final A a;
  final VoidCallback? more;
  const OwnerRow(this.a, {super.key, this.more});
  @override
  Widget build(BuildContext context) {
    final s = Store.i;
    return Row(children: [
      Tap(onTap: () => go(context, ProfilePage(a.owner)), child: Avatar(a.ownerAvatar, a.ownerName, 42)),
      const SizedBox(width: 10),
      Expanded(child: Tap(onTap: () => go(context, ProfilePage(a.owner)), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [Flexible(child: Text(a.ownerName, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15.5))), if (a.ownerVerified) const Padding(padding: EdgeInsets.only(left: 4), child: Icon(Icons.verified_rounded, size: 15, color: leaf))]),
        Text('${a.owner} · ${s.when(a.created)}', maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: sub(context), fontSize: 12.5)),
      ]))),
      if (more != null) IconBtn(Icons.more_horiz_rounded, more!, color: sub(context)),
    ]);
  }
}

/// Aksi di bawah post: sorot, komentar, simpan, bagikan.
class PostActions extends StatelessWidget {
  final A a;
  final VoidCallback? onComments;
  const PostActions(this.a, {super.key, this.onComments});
  @override
  Widget build(BuildContext context) {
    final s = Store.i;
    return ListenableBuilder(listenable: s, builder: (_, __) => Row(children: [
      LikeBtn(a.liked, a.likes, () => likeAudio(a)),
      ActBtn(HK.comment, onComments ?? () => openPost(context, a), count: a.comments),
      const Spacer(),
      ActBtn(HK.save, () => savePost(a), on: a.saved),
      ActBtn(HK.share, () => sharePost(a)),
    ]));
  }
}

Future<void> postMenu(BuildContext context, A a, {VoidCallback? onDeleted}) {
  final s = Store.i;
  final mine = s.me?.username == a.owner;
  return sheet(context, (ctx) => Column(mainAxisSize: MainAxisSize.min, children: [
    PBtn(s.t('share'), () { Navigator.pop(ctx); sharePost(a); }, ghost: true, icon: Icons.ios_share_rounded),
    const SizedBox(height: 10),
    if (mine) PBtn(s.t('delete'), () async {
      Navigator.pop(ctx);
      if (!await confirm(context, s.t('delete'), s.t('delete_audio_q'), s.t('delete'), danger: true)) return;
      try { await Api.req('DELETE', '/audios/${a.id}'); onDeleted?.call(); } catch (e) { toast(s.err(e), bad: true); }
    }, ghost: true, icon: Icons.delete_outline_rounded, fgc: heart)
    else if (s.me != null) PBtn(s.t('report'), () { Navigator.pop(ctx); reportSheet(context, audio: a.id); }, ghost: true, icon: Icons.flag_outlined),
  ]));
}

// ---------- kartu post (daftar Hups, profil) ----------
class PostCard extends StatelessWidget {
  final A a;
  final Object? scope;
  final VoidCallback? onDeleted;
  const PostCard(this.a, {super.key, this.scope, this.onDeleted});
  @override
  Widget build(BuildContext context) {
    final s = Store.i;
    final text = a.desc.trim();
    return Tap(
      onTap: () => openPost(context, a), scale: .99,
      child: Container(
        margin: const EdgeInsets.only(bottom: 12), padding: const EdgeInsets.fromLTRB(16, 14, 8, 4),
        decoration: BoxDecoration(color: card(context), borderRadius: BorderRadius.circular(28), border: Border.all(color: ink(context).withValues(alpha: .07)), boxShadow: [BoxShadow(color: green.withValues(alpha: .05), blurRadius: 18, offset: const Offset(0, 6))]),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          OwnerRow(a, more: () => postMenu(context, a, onDeleted: onDeleted)),
          if (text.isNotEmpty) Padding(padding: const EdgeInsets.fromLTRB(0, 10, 8, 0), child: Text.rich(TextSpan(children: [
            TextSpan(text: text),
            if (a.long) TextSpan(text: ' …  ${s.t('read_more')}', style: TextStyle(color: acc(context), fontWeight: FontWeight.w700)),
          ]), maxLines: 8, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 15.5, height: 1.45))),
          if (a.files.isNotEmpty) Padding(padding: const EdgeInsets.only(right: 8), child: Column(children: [
            for (var i = 0; i < a.files.length && i < 3; i++) FileBar(fileKey(a, i), '${a.files[i]['url']}', (a.files[i]['secs'] as num?)?.toInt() ?? 0, scope: scope),
            if (a.files.length > 3) Padding(padding: const EdgeInsets.only(top: 8), child: Align(alignment: Alignment.centerLeft, child: Text('+${a.files.length - 3} audio', style: TextStyle(color: sub(context), fontSize: 13, fontWeight: FontWeight.w700)))),
          ])),
          const SizedBox(height: 4),
          PostActions(a),
        ]),
      ),
    );
  }
}

// ---------- umpan Hups ----------
class HupsFeed extends StatefulWidget {
  final String filter;
  const HupsFeed(this.filter, {super.key});
  @override
  State<HupsFeed> createState() => _HupsFeedState();
}

class _HupsFeedState extends State<HupsFeed> {
  final items = <A>[];
  final sc = ScrollController();
  bool loading = true, more = false;
  int next = 0;
  String? error;

  @override
  void initState() {
    super.initState();
    sc.addListener(() { if (sc.position.pixels > sc.position.maxScrollExtent - 600) _more(); });
    _load();
  }
  @override
  void dispose() { sc.dispose(); Store.i.leave(this); super.dispose(); }

  Future<void> _load() async {
    try {
      final j = await Api.req('GET', '/hups?f=${widget.filter}');
      items..clear()..addAll((j['items'] as List).map((e) => A.from(e)));
      next = (j['next'] as num).toInt();
      error = null;
    } catch (e) { error = Store.i.err(e); }
    if (mounted) setState(() => loading = false);
  }

  Future<void> _more() async {
    if (more || next == 0 || loading) return;
    more = true;
    try {
      final j = await Api.req('GET', '/hups?f=${widget.filter}&before=$next');
      items.addAll((j['items'] as List).map((e) => A.from(e)));
      next = (j['next'] as num).toInt();
    } catch (_) {}
    more = false;
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final s = Store.i;
    if (loading) return const Loader();
    if (error != null) return Empty(Icons.cloud_off_rounded, error!, action: SizedBox(width: 160, child: PBtn(s.t('retry'), () { setState(() => loading = true); _load(); })));
    return RefreshIndicator(color: ink(context), backgroundColor: card(context), onRefresh: _load, child: items.isEmpty
        ? ListView(children: [SizedBox(height: 80), Empty(Icons.forum_outlined, s.t('no_hups'), custom: HIcon(HK.hups, size: 32, color: sub(context)))])
        : ListView.builder(
            controller: sc, physics: const AlwaysScrollableScrollPhysics(), padding: const EdgeInsets.fromLTRB(16, 6, 16, 110), itemCount: items.length,
            itemBuilder: (_, i) => In(i < 8 ? i : 0, PostCard(items[i], key: ValueKey('h${items[i].id}'), scope: this, onDeleted: () => setState(() => items.removeAt(i)))),
          ));
  }
}

// ---------- halaman post ----------
class PostPage extends StatefulWidget {
  final int id;
  final A? seed;
  const PostPage(this.id, {super.key, this.seed});
  @override
  State<PostPage> createState() => _PostPageState();
}

class _PostPageState extends State<PostPage> {
  A? a;
  String text = '';
  List<Map> cmts = [];
  bool loading = true, sending = false;
  String? error;
  final input = TextEditingController();
  AudioClip? clip;
  Map? replyTo;
  final sc = ScrollController();

  @override
  void initState() { super.initState(); a = widget.seed; text = widget.seed?.desc ?? ''; _load(); }
  @override
  void dispose() { input.dispose(); sc.dispose(); Store.i.leave(this); super.dispose(); }

  Future<void> _load() async {
    try {
      final j = await Api.req('GET', '/posts/${widget.id}');
      a = A.from(j['post']);
      text = j['text'] ?? '';
      await _comments();
      error = null;
    } catch (e) {
      error = e is ApiErr && e.code == 'not_found' ? Store.i.t('post_gone') : Store.i.err(e);
    }
    if (mounted) setState(() => loading = false);
  }

  Future<void> _comments() async {
    final j = await Api.req('GET', '/posts/${widget.id}/comments');
    cmts = [for (final c in j['items'] as List) Map.from(c as Map)];
  }

  Future<void> _addClip() async {
    final c = await sheet<AudioClip>(context, (_) => const RecordSheet());
    if (c != null && mounted) setState(() => clip = c);
  }

  Future<void> _send() async {
    final s = Store.i, t = input.text.trim();
    if (t.isEmpty && clip == null) return;
    setState(() => sending = true);
    int? id;
    try {
      final j = await Api.req('POST', '/posts/${widget.id}/comments', body: {'text': t, 'parent': replyTo?['id'], 'audio': clip != null});
      id = (j['id'] as num).toInt();
      if (clip != null) await Api.multi('/comments/$id/audio', clip!.bytes, 'a.${clip!.ext}', {'secs': '${clip!.secs}'});
      input.clear();
      clip = null;
      replyTo = null;
      await _comments();
      final p = await Api.req('GET', '/posts/${widget.id}');
      a = A.from(p['post']);
    } catch (e) {
      if (id != null) { try { await Api.req('DELETE', '/comments/$id'); } catch (_) {} }
      toast(s.err(e), bad: true);
    }
    if (mounted) setState(() => sending = false);
  }

  Future<void> _delCmt(Map c) async {
    final s = Store.i;
    if (!await confirm(context, s.t('delete'), s.t('delete_cmt_q'), s.t('delete'), danger: true)) return;
    try { await Api.req('DELETE', '/comments/${c['id']}'); await _comments(); final p = await Api.req('GET', '/posts/${widget.id}'); a = A.from(p['post']); } catch (e) { toast(s.err(e), bad: true); }
    if (mounted) setState(() {});
  }

  Future<void> _likeCmt(Map c) async {
    final s = Store.i;
    if (s.me == null) { toast(s.t('need_login')); return; }
    try {
      final j = await Api.req('POST', '/comments/${c['id']}/like');
      c['liked'] = j['liked'];
      c['likes'] = j['likes'];
    } catch (e) { toast(s.err(e), bad: true); }
    if (mounted) setState(() {});
  }

  /// Urutan tampilan: komentar utama, lalu balasannya menjorok ke dalam.
  List<(Map, int)> _flat() {
    final kids = <int, List<Map>>{};
    for (final c in cmts) { (kids[c['parent'] as int] ??= []).add(c); }
    final out = <(Map, int)>[];
    void walk(int p, int d) { for (final c in kids[p] ?? const <Map>[]) { out.add((c, d)); walk(c['id'] as int, d + 1); } }
    walk(0, 0);
    return out;
  }

  Widget _composer(Store s) {
    if (s.me == null) {
      return Padding(padding: const EdgeInsets.fromLTRB(16, 8, 16, 14), child: PBtn(s.t('login_comment'), () => go(context, const AuthPage()).then((_) { if (mounted) setState(() {}); }), icon: Icons.login_rounded));
    }
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 10),
      decoration: BoxDecoration(color: card(context), border: Border(top: BorderSide(color: ink(context).withValues(alpha: .08)))),
      child: SafeArea(top: false, child: Column(mainAxisSize: MainAxisSize.min, children: [
        if (replyTo != null) Padding(padding: const EdgeInsets.only(bottom: 6), child: Row(children: [
          Expanded(child: Text(s.t('replying').replaceAll('{n}', '${replyTo!['name']}'), style: TextStyle(color: acc(context), fontWeight: FontWeight.w700, fontSize: 13))),
          Tap(onTap: () => setState(() => replyTo = null), child: Icon(Icons.close_rounded, size: 18, color: sub(context))),
        ])),
        if (clip != null) Padding(padding: const EdgeInsets.only(bottom: 6), child: Row(children: [
          Icon(Icons.graphic_eq_rounded, size: 18, color: acc(context)), const SizedBox(width: 8),
          Expanded(child: Text('Audio · ${mmss(clip!.secs)}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5))),
          Tap(onTap: () => setState(() => clip = null), child: Icon(Icons.close_rounded, size: 18, color: sub(context))),
        ])),
        Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Tap(onTap: clip == null ? _addClip : null, child: Padding(padding: const EdgeInsets.fromLTRB(4, 10, 10, 10), child: Icon(Icons.mic_none_rounded, size: 26, color: clip == null ? ink(context) : sub(context)))),
          Expanded(child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16), decoration: BoxDecoration(color: soft(context), borderRadius: BorderRadius.circular(24)),
            child: TextField(controller: input, minLines: 1, maxLines: 5, textCapitalization: TextCapitalization.sentences, style: const TextStyle(fontSize: 15.5), cursorColor: ink(context), decoration: InputDecoration(border: InputBorder.none, hintText: s.t('comment_ph'), hintStyle: TextStyle(color: sub(context)))),
          )),
          const SizedBox(width: 8),
          Tap(onTap: sending ? null : _send, child: Container(width: 46, height: 46, decoration: const BoxDecoration(color: green, shape: BoxShape.circle), child: sending ? const Padding(padding: EdgeInsets.all(13), child: CircularProgressIndicator(strokeWidth: 2.2, color: cream)) : const Icon(Icons.arrow_upward_rounded, color: cream, size: 22))),
        ]),
      ])),
    );
  }

  @override
  Widget build(BuildContext context) {
    final s = Store.i;
    final p = a;
    return Scaffold(body: Column(children: [
      TopBar(back: true, title: s.t('hups'), actions: p == null ? [] : [IconBtn(Icons.more_horiz_rounded, () => postMenu(context, p, onDeleted: () { if (mounted) Navigator.pop(context); }))]),
      Expanded(child: loading && p == null ? const Loader() : error != null && p == null ? Empty(Icons.lock_outline_rounded, error!) : ListView(controller: sc, padding: const EdgeInsets.fromLTRB(18, 4, 18, 24), children: [
        OwnerRow(p!),
        if (text.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 14), child: SelectableText(text, style: const TextStyle(fontSize: 17, height: 1.55))),
        if (p.files.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 6), child: Column(children: [for (var i = 0; i < p.files.length; i++) FileBar(fileKey(p, i), '${p.files[i]['url']}', (p.files[i]['secs'] as num?)?.toInt() ?? 0, scope: this)])),
        const SizedBox(height: 10),
        PostActions(p, onComments: () {}),
        Divider(color: ink(context).withValues(alpha: .08), height: 24),
        Text('${s.t('comments')} (${p.comments})', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
        const SizedBox(height: 10),
        if (cmts.isEmpty) Padding(padding: const EdgeInsets.symmetric(vertical: 24), child: Center(child: Text(s.t('empty_cmt'), style: TextStyle(color: sub(context)), textAlign: TextAlign.center))),
        for (final e in _flat()) CommentTile(e.$1, e.$2 > 4 ? 4 : e.$2, postOwner: p.owner, scope: this, onReply: () => setState(() { replyTo = e.$1; }), onLike: () => _likeCmt(e.$1), onDelete: () => _delCmt(e.$1)),
      ])),
      _composer(s),
    ]));
  }
}

class CommentTile extends StatefulWidget {
  final Map c;
  final int depth;
  final String postOwner;
  final Object? scope;
  final VoidCallback onReply, onLike, onDelete;
  const CommentTile(this.c, this.depth, {super.key, required this.postOwner, this.scope, required this.onReply, required this.onLike, required this.onDelete});
  @override
  State<CommentTile> createState() => _CommentTileState();
}

class _CommentTileState extends State<CommentTile> {
  String? full;
  bool loadingFull = false;

  Future<void> _full() async {
    setState(() => loadingFull = true);
    try { full = (await Api.req('GET', '/comments/${widget.c['id']}/text'))['text']; } catch (e) { toast(Store.i.err(e), bad: true); }
    if (mounted) setState(() => loadingFull = false);
  }

  @override
  Widget build(BuildContext context) {
    final s = Store.i, c = widget.c;
    final liked = c['liked'] == true, can = c['mine'] == true || s.me?.username == widget.postOwner;
    final audio = c['audio'] as Map?;
    final shown = full ?? '${c['text']}';
    return Padding(
      padding: EdgeInsets.only(left: widget.depth * 18.0, bottom: 14),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        if (widget.depth > 0) Container(width: 2, height: 34, margin: const EdgeInsets.only(right: 10, top: 4), decoration: BoxDecoration(color: ink(context).withValues(alpha: .12), borderRadius: BorderRadius.circular(1))),
        Tap(onTap: () => go(context, ProfilePage('${c['username']}')), child: Avatar(c['avatar'], '${c['name']}', 34)),
        const SizedBox(width: 10),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Flexible(child: Text('${c['name']}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5))),
            if (c['verified'] == true) const Padding(padding: EdgeInsets.only(left: 3), child: Icon(Icons.verified_rounded, size: 14, color: leaf)),
            const SizedBox(width: 8),
            Text(s.when((c['created'] as num).toInt()), style: TextStyle(color: sub(context), fontSize: 12)),
          ]),
          if (shown.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 3), child: SelectableText(shown, style: const TextStyle(fontSize: 15, height: 1.45))),
          if (c['long'] == true && full == null) Tap(onTap: loadingFull ? null : _full, child: Padding(padding: const EdgeInsets.only(top: 4), child: Text(loadingFull ? '…' : s.t('read_more'), style: TextStyle(color: acc(context), fontWeight: FontWeight.w700, fontSize: 13.5)))),
          if (audio != null) FileBar(-(1000000000 + (c['id'] as int)), '${audio['url']}', (audio['secs'] as num).toInt(), scope: widget.scope),
          Row(children: [
            ActBtn(HK.sorot, widget.onLike, on: liked, count: (c['likes'] as num).toInt()),
            Tap(onTap: s.me == null ? () => toast(s.t('need_login')) : widget.onReply, child: Padding(padding: const EdgeInsets.all(8), child: Text(s.t('reply'), style: TextStyle(color: sub(context), fontWeight: FontWeight.w700, fontSize: 13)))),
            if (can) Tap(onTap: widget.onDelete, child: Padding(padding: const EdgeInsets.all(8), child: Icon(Icons.delete_outline_rounded, size: 19, color: sub(context)))),
          ]),
        ])),
      ]),
    );
  }
}

// ---------- tulis post ----------
class ComposePage extends StatefulWidget {
  const ComposePage({super.key});
  @override
  State<ComposePage> createState() => _ComposeState();
}

class _ComposeState extends State<ComposePage> {
  final text = TextEditingController();
  final clips = <AudioClip>[];
  final pv = AudioPlayer();
  int? previewing;
  bool inRand = true, inHups = true, pprof = true, busy = false;
  String rand = 'public';
  Map<String, Map> picked = {};

  @override
  void initState() { super.initState(); pv.onPlayerComplete.listen((_) { if (mounted) setState(() => previewing = null); }); }
  @override
  void dispose() { text.dispose(); pv.dispose(); super.dispose(); }

  Future<void> _add() async {
    final s = Store.i;
    if (clips.length >= 10) { toast(s.t('post_audio_max')); return; }
    final c = await sheet<AudioClip>(context, (_) => const RecordSheet());
    if (c == null || !mounted) return;
    setState(() { clips.add(c); if (clips.length > 1) inRand = false; if (!inRand && !inHups) inHups = true; });
  }

  Future<void> _play(int i) async {
    if (previewing == i) { await pv.stop(); setState(() => previewing = null); return; }
    setState(() => previewing = i);
    await pv.play(BytesSource(clips[i].bytes, mimeType: mimeOf(clips[i].bytes)));
  }

  Future<void> _pickAcc() async {
    final r = await sheet<Map<String, Map>>(context, (_) => AccountPickSheet(Map.of(picked)));
    if (r == null || !mounted) return;
    setState(() { picked = r; if (r.isEmpty && rand == 'accounts') rand = 'public'; });
  }

  Future<void> _send() async {
    final s = Store.i, t = text.text.trim();
    if (t.isEmpty && clips.isEmpty) { toast(s.t('e_empty'), bad: true); return; }
    if (!inRand && !inHups) { toast(s.t('e_pick_place'), bad: true); return; }
    if (rand == 'accounts' && picked.isEmpty) { toast(s.t('e_need_accounts'), bad: true); return; }
    setState(() => busy = true);
    int? id;
    try {
      final j = await Api.req('POST', '/posts', body: {'text': t, 'audios': clips.length, 'rand_on': inRand && clips.length <= 1, 'hups': inHups, 'pprof': pprof, 'rand': rand, 'to': picked.keys.toList()});
      id = (j['id'] as num).toInt();
      for (final c in clips) { await Api.multi('/posts/$id/audio', c.bytes, 'a.${c.ext}', {'secs': '${c.secs}'}); }
      if (!mounted) return;
      Navigator.pop(context, true);
      toast(s.t('posted'));
    } catch (e) {
      if (id != null) { try { await Api.req('DELETE', '/audios/$id'); } catch (_) {} }
      toast(s.err(e), bad: true);
      if (mounted) setState(() => busy = false);
    }
  }

  Widget _row(String label, bool v, ValueChanged<bool>? on, {HK? k, String? note}) => Padding(padding: const EdgeInsets.only(bottom: 14), child: Row(children: [
        if (k != null) Padding(padding: const EdgeInsets.only(right: 12), child: HIcon(k, size: 22, color: ink(context))),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(label, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16)), if (note != null) Text(note, style: TextStyle(color: sub(context), fontSize: 12.5))])),
        Opacity(opacity: on == null ? .4 : 1, child: Toggle(v, (x) => on?.call(x))),
      ]));

  @override
  Widget build(BuildContext context) {
    final s = Store.i;
    final multi = clips.length > 1;
    return Scaffold(body: Column(children: [
      TopBar(back: true, title: s.t('new_post')),
      Expanded(child: ListView(padding: const EdgeInsets.fromLTRB(22, 4, 22, 40), children: [
        Container(
          padding: const EdgeInsets.fromLTRB(18, 8, 18, 8), decoration: BoxDecoration(color: soft(context), borderRadius: BorderRadius.circular(26)),
          child: TextField(controller: text, minLines: 6, maxLines: 18, textCapitalization: TextCapitalization.sentences, style: const TextStyle(fontSize: 16.5, height: 1.5), cursorColor: ink(context), decoration: InputDecoration(border: InputBorder.none, hintText: s.t('write_hups'), hintStyle: TextStyle(color: sub(context)))),
        ),
        const SizedBox(height: 16),
        for (var i = 0; i < clips.length; i++) Container(
          margin: const EdgeInsets.only(bottom: 8), padding: const EdgeInsets.fromLTRB(8, 8, 8, 8), decoration: BoxDecoration(color: soft(context), borderRadius: BorderRadius.circular(24)),
          child: Row(children: [
            Tap(onTap: () => _play(i), child: Container(width: 40, height: 40, decoration: BoxDecoration(color: previewing == i ? ink(context) : green, shape: BoxShape.circle), child: Icon(previewing == i ? Icons.pause_rounded : Icons.play_arrow_rounded, color: previewing == i ? bgOf(context) : cream, size: 22))),
            const SizedBox(width: 12),
            Expanded(child: Text('Audio ${i + 1} · ${mmss(clips[i].secs)}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15))),
            IconBtn(Icons.close_rounded, () { setState(() { clips.removeAt(i); previewing = null; }); pv.stop(); }, color: sub(context)),
          ]),
        ),
        PBtn('${s.t('add_audio')} (${clips.length}/10)', busy ? null : _add, ghost: true, icon: Icons.mic_none_rounded),
        const SizedBox(height: 24),
        _row(s.t('in_rand'), inRand && !multi, multi ? null : (v) => setState(() { inRand = v; if (!inRand && !inHups) inHups = true; }), k: HK.acak, note: multi ? s.t('multi_no_rand') : null),
        _row(s.t('in_hups'), inHups, (v) => setState(() { inHups = v; if (!inHups && !(inRand && !multi)) inRand = !multi; }), k: HK.hups),
        if (inRand && !multi) _row(s.t('pprof'), pprof, (v) => setState(() => pprof = v)),
        const SizedBox(height: 6),
        Pick(s.t('who_see'), rand, (v) async {
          if (v == 'accounts') { await _pickAcc(); if (picked.isEmpty) return; }
          if (mounted) setState(() => rand = v);
        }, opts: uploadAud),
        if (rand == 'accounts') Padding(padding: const EdgeInsets.only(top: 10), child: Tap(onTap: _pickAcc, scale: .98, child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14), decoration: BoxDecoration(color: soft(context), borderRadius: BorderRadius.circular(24)),
          child: Row(children: [Icon(Icons.person_search_outlined, size: 20, color: ink(context)), const SizedBox(width: 12), Expanded(child: Text(s.t('pick_acc_n').replaceAll('{n}', '${picked.length}'), style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15))), Icon(Icons.edit_outlined, size: 18, color: sub(context))]),
        ))),
        const SizedBox(height: 26),
        PBtn(s.t('upload'), _send, loading: busy, icon: Icons.arrow_upward_rounded),
        const SizedBox(height: 12),
        Center(child: Text(s.t('noedit'), style: TextStyle(color: sub(context), fontSize: 13))),
      ])),
    ]));
  }
}
