import 'dart:ui' show FontFeature;
import 'dart:math' as math;
// Hups: tulisan tanpa batas, 1 audio (bisa backsound), komentar bersarang, simpan, bagikan.
import 'dart:async';
import 'package:audioplayers/audioplayers.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'extra.dart';
import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';
import 'package:share_plus/share_plus.dart';
import 'core.dart';
import 'pages.dart';
import 'ui.dart';

String postLink(int id) => 'https://hulhup.my.id/p/$id';
String commentLink(int post, int c) => 'https://hulhup.my.id/p/$post/c/$c';

Future<void> shareUrl(String u) async {
  try { await Share.share(u, subject: 'Hulhup'); } catch (_) { await Clipboard.setData(ClipboardData(text: u)); toast(Store.i.t('link_copied')); }
}

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
    if (f.size > 1024 * 1024) { toast(s.t('e_too_big'), bad: true); return; }
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
      Tap(onTap: _rec, child: AnimatedContainer(duration: const Duration(milliseconds: 300), curve: Curves.easeOutCubic, width: recording ? 84 : 112, height: recording ? 84 : 112, decoration: BoxDecoration(color: recording ? heart : btnBg(context), borderRadius: BorderRadius.circular(recording ? 26 : 56), boxShadow: [BoxShadow(color: (recording ? heart : brand).withValues(alpha: .3), blurRadius: 26, offset: const Offset(0, 10))]), child: Icon(recording ? Icons.stop_rounded : Icons.mic_rounded, color: cream, size: 40))),
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
      PBtn(s.t('use_audio'), bytes == null || recording ? null : () { if (bytes!.length > 1024 * 1024) { toast(s.t('rec_over'), bad: true); return; } Navigator.pop(context, AudioClip(bytes!, ext, ms)); }, icon: Icons.check_rounded),
    ]);
  }
}

// ---------- pemutar kecil ----------
/// Audio sebuah post (satu), dengan tanda bila terdeteksi buatan AI.
Widget audioBars(A a, Object? scope) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      for (var i = 0; i < a.files.length; i++) FileBar(fileKey(a, i), '${a.files[i]['url']}', (a.files[i]['secs'] as num?)?.toInt() ?? 0, scope: scope, onStart: () => Store.i.countPlay(a)),
      if (a.ai) AiTag(Store.i.t(a.aiKind == 'edited' ? 'ai_audio_edit' : 'ai_audio')),
    ]);

String bgmUrl(A a) => '${a.files[a.bgmIdx.clamp(0, a.files.length - 1)]['url']}';

int fileKey(A a, int i) => i == 0 ? a.id : -(a.id * 20 + i);

/// Gelombang suara khas Hulhup: tinggi batang diturunkan dari kunci audio, jadi tiap post punya bentuknya sendiri.
/// Bagian yang sudah terputar memakai warna tinta, batang yang sedang diputar memakai aksen.
class WavePainter extends CustomPainter {
  final int seed;
  final double progress;
  final Color played, rest, now;
  const WavePainter(this.seed, this.progress, this.played, this.rest, this.now);
  static List<double> shape(int seed, int n) {
    var x = (seed * 2654435761 + 40503) & 0x7fffffff;
    double rnd() { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; }
    final raw = [for (var i = 0; i < n; i++) rnd()];
    final out = <double>[];
    for (var i = 0; i < n; i++) {
      final a = raw[i], b = raw[(i + 1) % n], c = raw[(i + n - 1) % n];
      final env = .55 + .45 * math.sin(math.pi * (i + .5) / n); // suara cenderung menggembung di tengah
      out.add((.18 + .82 * (a * .6 + b * .2 + c * .2)) * env);
    }
    return out;
  }
  @override
  void paint(Canvas canvas, Size size) {
    const gap = 3.0, w = 3.0;
    final n = ((size.width + gap) / (w + gap)).floor().clamp(8, 80);
    final hs = shape(seed, n);
    final cur = (progress * n).floor();
    for (var i = 0; i < n; i++) {
      final h = (size.height * hs[i]).clamp(4.0, size.height);
      final r = RRect.fromRectAndRadius(Rect.fromCenter(center: Offset(i * (w + gap) + w / 2, size.height / 2), width: w, height: h), const Radius.circular(2));
      canvas.drawRRect(r, Paint()..color = progress <= 0 ? rest : (i < cur ? played : (i == cur ? now : rest)));
    }
  }
  @override
  bool shouldRepaint(WavePainter o) => o.progress != progress || o.seed != seed || o.played != played || o.rest != rest || o.now != now;
}

/// Pemutar satu audio: tombol putar, gelombang suara, waktu, dan kecepatan (0.5×–2×).
class FileBar extends StatelessWidget {
  final int keyId;
  final String url;
  final int secs;
  final Object? scope;
  final VoidCallback? onStart;
  const FileBar(this.keyId, this.url, this.secs, {super.key, this.scope, this.onStart});
  static String rateText(double r) => r == r.roundToDouble() ? '${r.toInt()}×' : '${r.toString().replaceAll(RegExp(r'0+$'), '')}×';
  @override
  Widget build(BuildContext context) {
    final s = Store.i;
    return ListenableBuilder(listenable: s, builder: (_, __) {
      final on = s.playing == keyId;
      return Container(
        margin: const EdgeInsets.only(top: 10), padding: const EdgeInsets.fromLTRB(8, 8, 12, 8),
        decoration: BoxDecoration(borderRadius: BorderRadius.circular(16), border: Border.all(color: ink(context).withValues(alpha: on ? .5 : .12), width: on ? 1.4 : 1)),
        child: Row(children: [
          Tap(onTap: () { if (!on) onStart?.call(); return s.playUrl(keyId, url, scope: scope).catchError((_) => toast(s.t('e_server'), bad: true)); }, child: AnimatedContainer(duration: const Duration(milliseconds: 220), width: 40, height: 40, decoration: BoxDecoration(color: on ? brand : btnBg(context), borderRadius: BorderRadius.circular(on ? 12 : 20)), child: Icon(on ? Icons.pause_rounded : Icons.play_arrow_rounded, color: on ? Colors.white : cream, size: 22))),
          const SizedBox(width: 12),
          Expanded(child: SizedBox(height: 32, child: ValueListenableBuilder<int>(valueListenable: s.pos, builder: (_, ms, __) {
            final total = (on && s.dur > 0 ? s.dur : (secs > 0 ? secs * 1000 : 15000)).clamp(1, 1 << 30);
            return CustomPaint(painter: WavePainter(keyId, on ? (ms / total).clamp(0.0, 1.0) : 0, ink(context), ink(context).withValues(alpha: .2), brand), size: Size.infinite);
          }))),
          const SizedBox(width: 10),
          ValueListenableBuilder<int>(valueListenable: s.pos, builder: (_, ms, __) => Text(on ? mmss(ms ~/ 1000) : (secs > 0 ? mmss(secs) : '·'), style: TextStyle(color: on ? ink(context) : sub(context), fontSize: 12.5, fontWeight: FontWeight.w700, fontFeatures: const [FontFeature.tabularFigures()]))),
          const SizedBox(width: 6),
          Tap(onTap: s.cycleRate, scale: .92, child: Padding(padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 6), child: Text(rateText(s.rate), style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: s.rate == 1.0 ? sub(context) : acc(context))))),
        ]),
      );
    });
  }
}

/// Penanda untuk audio yang terdeteksi buatan AI.
class AiTag extends StatelessWidget {
  final String label;
  const AiTag(this.label, {super.key});
  @override
  Widget build(BuildContext context) => Padding(padding: const EdgeInsets.only(top: 8), child: Row(mainAxisSize: MainAxisSize.min, children: [
        Container(padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4), decoration: BoxDecoration(color: const Color(0xFFD6336C).withValues(alpha: .12), borderRadius: BorderRadius.circular(10)), child: Row(mainAxisSize: MainAxisSize.min, children: [
          const Icon(Icons.auto_awesome_rounded, size: 13, color: Color(0xFFD6336C)), const SizedBox(width: 5),
          Text(label, style: const TextStyle(color: Color(0xFFD6336C), fontSize: 12, fontWeight: FontWeight.w700)),
        ])),
      ]));
}

/// Tempat audio pada form post: kosong = ajakan merekam/memilih; terisi = gelombang + putar + ganti/hapus.
class _AudioSlot extends StatelessWidget {
  final AudioClip? clip;
  final bool playing;
  final VoidCallback onPlay, onClear;
  final VoidCallback? onPick;
  const _AudioSlot({required this.clip, required this.playing, required this.onPlay, required this.onPick, required this.onClear});
  @override
  Widget build(BuildContext context) {
    final s = Store.i, c = clip;
    if (c == null) {
      return Tap(onTap: onPick, scale: .98, child: Container(
        padding: const EdgeInsets.symmetric(vertical: 26, horizontal: 18), width: double.infinity,
        decoration: BoxDecoration(borderRadius: BorderRadius.circular(20), border: Border.all(color: ink(context).withValues(alpha: .25), width: 1.4)),
        child: Column(children: [
          Container(width: 54, height: 54, decoration: BoxDecoration(color: btnBg(context), shape: BoxShape.circle), child: const Icon(Icons.mic_rounded, color: cream, size: 26)),
          const SizedBox(height: 12),
          Text(s.t('add_audio'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
          const SizedBox(height: 3),
          Text(s.t('audio_req'), style: TextStyle(color: sub(context), fontSize: 12.5)),
        ]),
      ));
    }
    return Container(
      padding: const EdgeInsets.fromLTRB(10, 10, 6, 10),
      decoration: BoxDecoration(borderRadius: BorderRadius.circular(20), border: Border.all(color: ink(context).withValues(alpha: .5), width: 1.4)),
      child: Row(children: [
        Tap(onTap: onPlay, child: Container(width: 44, height: 44, decoration: BoxDecoration(color: playing ? brand : btnBg(context), borderRadius: BorderRadius.circular(playing ? 13 : 22)), child: Icon(playing ? Icons.pause_rounded : Icons.play_arrow_rounded, color: playing ? Colors.white : cream, size: 24))),
        const SizedBox(width: 12),
        Expanded(child: SizedBox(height: 34, child: CustomPaint(painter: WavePainter(c.bytes.length, 0, ink(context), ink(context).withValues(alpha: .35), brand), size: Size.infinite))),
        const SizedBox(width: 10),
        Text(mmss(c.secs), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5)),
        IconBtn(Icons.refresh_rounded, onPick ?? () {}, color: sub(context)),
        IconBtn(Icons.close_rounded, onClear, color: sub(context)),
      ]),
    );
  }
}

/// Penanda backsound: audio post yang terputar otomatis saat post terlihat. Pembaca bisa mematikannya.
class BgmBar extends StatelessWidget {
  final A a;
  const BgmBar(this.a, {super.key});
  @override
  Widget build(BuildContext context) {
    final s = Store.i;
    return ListenableBuilder(listenable: s, builder: (_, __) {
      final live = s.bgmKey == a.id && !s.bgmMuted;
      return Container(
        margin: const EdgeInsets.only(top: 8), padding: const EdgeInsets.fromLTRB(14, 8, 6, 8),
        decoration: BoxDecoration(color: soft(context), borderRadius: BorderRadius.circular(24)),
        child: Row(children: [
          Icon(Icons.music_note_rounded, size: 18, color: live ? acc(context) : sub(context)),
          const SizedBox(width: 8),
          Expanded(child: Text(s.t('bgm_tag'), style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5, color: live ? ink(context) : sub(context)))),
          Tap(onTap: () { s.setBgmMuted(!s.bgmMuted); if (s.bgmKey != a.id && !s.bgmMuted && a.files.isNotEmpty) s.playBgm(a.id, '${a.files[a.bgmIdx.clamp(0, a.files.length - 1)]['url']}'); }, child: Padding(padding: const EdgeInsets.all(8), child: Icon(s.bgmMuted ? Icons.volume_off_rounded : Icons.volume_up_rounded, size: 20, color: s.bgmMuted ? sub(context) : ink(context)))),
        ]),
      );
    });
  }
}

/// Teks dengan @nama yang bisa diketuk (membuka profil akun itu).
class MentionText extends StatefulWidget {
  final String text;
  final TextStyle style;
  final int? maxLines;
  final bool selectable;
  const MentionText(this.text, {super.key, required this.style, this.maxLines, this.selectable = false});
  @override
  State<MentionText> createState() => _MentionTextState();
}

class _MentionTextState extends State<MentionText> {
  final _rec = <TapGestureRecognizer>[];
  @override
  void dispose() { for (final r in _rec) { r.dispose(); } super.dispose(); }

  TextSpan _spans(BuildContext context) {
    for (final r in _rec) { r.dispose(); }
    _rec.clear();
    final out = <InlineSpan>[];
    var last = 0;
    final re = RegExp('${linkRe.pattern}|@([a-z0-9_]{3,20})', caseSensitive: false);
    for (final m in re.allMatches(widget.text)) {
      final raw = m.group(0)!;
      final isTag = m.group(2) != null;
      final shown = isTag ? raw : trimLink(raw);
      if (shown.isEmpty) continue;
      if (m.start > last) out.add(TextSpan(text: widget.text.substring(last, m.start)));
      final r = TapGestureRecognizer()..onTap = isTag ? () => go(context, ProfilePage(m.group(2)!)) : () => openLink(context, shown);
      _rec.add(r);
      out.add(TextSpan(text: shown, style: TextStyle(color: acc(context), fontWeight: isTag ? FontWeight.w800 : FontWeight.w600, decoration: isTag ? null : TextDecoration.underline), recognizer: r));
      last = m.start + shown.length;
    }
    if (last < widget.text.length) out.add(TextSpan(text: widget.text.substring(last)));
    return TextSpan(children: out);
  }

  @override
  Widget build(BuildContext context) {
    final sp = _spans(context);
    return widget.selectable
        ? SelectableText.rich(sp, style: widget.style)
        : Text.rich(sp, style: widget.style, maxLines: widget.maxLines, overflow: widget.maxLines == null ? null : TextOverflow.ellipsis);
  }
}

/// Saran akun saat mengetik @… di kolom teks. Memilih satu mengganti ketikan dengan @nama.
class MentionBar extends StatefulWidget {
  final TextEditingController c;
  const MentionBar(this.c, {super.key});
  @override
  State<MentionBar> createState() => _MentionBarState();
}

class _MentionBarState extends State<MentionBar> {
  List<Map> users = [];
  String q = '';
  Timer? _t;
  int _seq = 0;
  @override
  void initState() { super.initState(); widget.c.addListener(_changed); }
  @override
  void dispose() { _t?.cancel(); widget.c.removeListener(_changed); super.dispose(); }

  void _changed() {
    final m = RegExp(r'@([a-z0-9_]{1,20})$').firstMatch(widget.c.text);
    final nq = m?.group(1) ?? '';
    if (nq == q) return;
    q = nq;
    _t?.cancel();
    if (q.isEmpty) { if (users.isNotEmpty) setState(() => users = []); return; }
    final my = ++_seq;
    _t = Timer(const Duration(milliseconds: 280), () async {
      try {
        final j = await Api.req('GET', '/search?q=${Uri.encodeQueryComponent(q)}');
        if (!mounted || my != _seq) return;
        setState(() => users = [for (final u in (j['users'] as List).take(6)) Map.from(u as Map)]);
      } catch (_) {}
    });
  }

  void _pick(String u) {
    final t = widget.c.text;
    final m = RegExp(r'@([a-z0-9_]{1,20})$').firstMatch(t);
    if (m == null) return;
    final nt = '${t.substring(0, m.start)}@$u ';
    widget.c.value = TextEditingValue(text: nt, selection: TextSelection.collapsed(offset: nt.length));
    setState(() => users = []);
  }

  @override
  Widget build(BuildContext context) {
    if (users.isEmpty) return const SizedBox.shrink();
    return SizedBox(height: 46, child: ListView(scrollDirection: Axis.horizontal, children: [
      for (final u in users) Padding(padding: const EdgeInsets.only(right: 8, bottom: 6), child: Tap(onTap: () => _pick('${u['username']}'), scale: .96, child: Container(
        padding: const EdgeInsets.fromLTRB(6, 4, 14, 4), decoration: BoxDecoration(color: soft(context), borderRadius: BorderRadius.circular(22)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [Avatar(u['avatar'] as String?, '${u['name']}', 28), const SizedBox(width: 8), Text('@${u['username']}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5))]),
      ))),
    ]));
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
        Row(children: [Flexible(child: Text(a.ownerName, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15.5))), if (a.ownerVerified) const Padding(padding: EdgeInsets.only(left: 4), child: Icon(Icons.verified_rounded, size: 15, color: blue))]),
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
    return ListenableBuilder(listenable: s, builder: (_, __) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        LikeBtn(a.liked, a.likes, () => likeAudio(a)),
        ActBtn(HK.comment, onComments ?? () => openPost(context, a), count: a.comments),
        const Spacer(),
        ActBtn(HK.save, () => savePost(a), on: a.saved),
        ActBtn(HK.share, () => sharePost(a)),
      ]),
      Padding(padding: const EdgeInsets.fromLTRB(8, 0, 8, 6), child: Text('${fmt(a.views)} ${s.t('views')} · ${fmt(a.plays)} ${s.t('plays')}', style: TextStyle(fontSize: 12.5, color: sub(context), fontWeight: FontWeight.w500))),
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
class PostCard extends StatefulWidget {
  final A a;
  final Object? scope;
  final VoidCallback? onDeleted;
  final bool showAudience;
  const PostCard(this.a, {super.key, this.scope, this.onDeleted, this.showAudience = false});
  @override
  State<PostCard> createState() => _PostCardState();
}

class _PostCardState extends State<PostCard> {
  String? full;
  bool busy = false;

  @override
  void initState() { super.initState(); Store.i.countView(widget.a); }

  /// Teks panjang di Hups tampil lengkap: tombol "Selengkapnya" membuka seluruh teks di tempat.
  Future<void> _expand() async {
    setState(() => busy = true);
    try { full = (await Api.req('GET', '/posts/${widget.a.id}'))['text'] as String?; } catch (e) { toast(Store.i.err(e), bad: true); }
    if (mounted) setState(() => busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final s = Store.i, a = widget.a;
    final text = (full ?? a.text ?? a.desc).trim();
    final partial = full == null && a.text == null && a.long;
    return Tap(
      onTap: () => openPost(context, a), scale: .99,
      child: Container(
        margin: const EdgeInsets.only(bottom: 12), padding: const EdgeInsets.fromLTRB(16, 14, 8, 4),
        decoration: BoxDecoration(color: card(context), borderRadius: BorderRadius.circular(28), border: Border.all(color: ink(context).withValues(alpha: .07)), boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: .05), blurRadius: 18, offset: const Offset(0, 6))]),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          OwnerRow(a, more: () => postMenu(context, a, onDeleted: widget.onDeleted)),
          Padding(padding: const EdgeInsets.only(top: 8, right: 8), child: audChip(context, a.rand, to: a.to)),
          if (text.isNotEmpty) Padding(padding: const EdgeInsets.fromLTRB(0, 10, 8, 0), child: MentionText(partial ? '$text …' : text, style: const TextStyle(fontSize: 15.5, height: 1.45))),
          if (partial) Tap(onTap: busy ? null : _expand, child: Padding(padding: const EdgeInsets.fromLTRB(0, 4, 8, 4), child: Text(busy ? '…' : s.t('read_more'), style: TextStyle(color: acc(context), fontWeight: FontWeight.w700, fontSize: 14)))),
          if (a.files.isNotEmpty) Padding(padding: const EdgeInsets.only(right: 8), child: audioBars(a, widget.scope)),
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

class _HupsFeedState extends State<HupsFeed> with WidgetsBindingObserver {
  final items = <A>[];
  final keys = <int, GlobalKey>{};
  final sc = ScrollController();
  bool loading = true, more = false, _busy = false;
  int next = 0;
  String? error;
  Timer? _live, _focusT;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    sc.addListener(() { if (sc.position.pixels > sc.position.maxScrollExtent - 600) _more(); });
    _load();
    // Real-time: segarkan diam-diam (tanpa layar memuat) dan cek post yang sedang di layar untuk backsound.
    _live = Timer.periodic(const Duration(seconds: 6), (_) => _silent());
    _focusT = Timer.periodic(const Duration(milliseconds: 600), (_) => _focus());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _live?.cancel();
    _focusT?.cancel();
    sc.dispose();
    Store.i.leave(this);
    Store.i.leaveBgm(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState st) {
    if (st != AppLifecycleState.resumed) { Store.i.leaveBgm(this); } else { _silent(); }
  }

  bool get _top => mounted && (ModalRoute.of(context)?.isCurrent ?? true);

  Future<void> _load() async {
    try {
      final j = await Api.req('GET', '/hups?f=${widget.filter}');
      items..clear()..addAll((j['items'] as List).map((e) => A.from(e)));
      next = (j['next'] as num).toInt();
      error = null;
    } catch (e) { error = Store.i.err(e); }
    if (mounted) setState(() => loading = false);
  }

  /// Segarkan tanpa mengganggu: di paling atas daftar diganti utuh, di bawahnya hanya angka sorot/komentar yang diperbarui.
  Future<void> _silent() async {
    if (!_top || loading || _busy || more) return;
    _busy = true;
    try {
      final j = await Api.req('GET', '/hups?f=${widget.filter}');
      final fresh = [for (final e in j['items'] as List) A.from(e)];
      if (!mounted) return;
      final atTop = !sc.hasClients || sc.position.pixels < 60;
      setState(() {
        if (atTop) {
          items..clear()..addAll(fresh);
          next = (j['next'] as num).toInt();
        } else {
          for (final f in fresh) {
            for (final o in items) {
              if (o.id == f.id) { o.likes = f.likes; o.comments = f.comments; o.liked = f.liked; o.saved = f.saved; }
            }
          }
        }
      });
    } catch (_) {}
    _busy = false;
  }

  Future<void> _more() async {
    if (more || next == 0 || loading) return;
    more = true;
    try {
      final j = await Api.req('GET', '/hups?f=${widget.filter}&next=$next');
      final have = items.map((e) => e.id).toSet();
      items.addAll([for (final e in j['items'] as List) A.from(e)].where((e) => !have.contains(e.id)));
      next = (j['next'] as num).toInt();
    } catch (_) {}
    more = false;
    if (mounted) setState(() {});
  }

  /// Post yang paling dekat tengah layar menjadi "fokus": bila itu backsound, otomatis diputar; bila bukan, dihentikan.
  void _focus() {
    if (!_top || items.isEmpty || !sc.hasClients) return;
    final s = Store.i;
    final box = context.findRenderObject() as RenderBox?;
    if (box == null || !box.attached) return;
    final top = box.localToGlobal(Offset.zero).dy, h = box.size.height, mid = top + h / 2;
    A? best;
    var bd = double.infinity;
    for (final a in items) {
      final rb = keys[a.id]?.currentContext?.findRenderObject() as RenderBox?;
      if (rb == null || !rb.attached) continue;
      final y = rb.localToGlobal(Offset.zero).dy;
      if (y > top + h - 40 || y + rb.size.height < top + 40) continue; // belum benar-benar terlihat
      final d = ((y + rb.size.height / 2) - mid).abs();
      if (d < bd) { bd = d; best = a; }
    }
    if (best != null && best.bgm && best.files.isNotEmpty) {
      s.playBgm(best.id, bgmUrl(best), scope: this);
    } else if (s.bgmKey != null) {
      s.leaveBgm(this);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = Store.i;
    if (loading) return const Loader();
    if (error != null) return Empty(Icons.cloud_off_rounded, error!, action: SizedBox(width: 160, child: PBtn(s.t('retry'), () { setState(() => loading = true); _load(); })));
    return LogoRefresh(onRefresh: _load, child: items.isEmpty
        ? ListView(children: [SizedBox(height: 80), Empty(Icons.forum_outlined, s.t('no_hups'), custom: HIcon(HK.hups, size: 32, color: sub(context)))])
        : ListView.builder(
            controller: sc, physics: const AlwaysScrollableScrollPhysics(), padding: const EdgeInsets.fromLTRB(16, 6, 16, 110), itemCount: items.length,
            itemBuilder: (_, i) {
              final a = items[i];
              return KeyedSubtree(key: keys.putIfAbsent(a.id, () => GlobalKey()), child: In(i < 8 ? i : 0, PostCard(a, key: ValueKey('h${a.id}'), scope: this, onDeleted: () { final id = a.id; keys.remove(id); setState(() => items.removeWhere((e) => e.id == id)); })));
            },
          ));
  }
}

// ---------- halaman post ----------
class PostPage extends StatefulWidget {
  final int id;
  final A? seed;
  final int? comment;
  const PostPage(this.id, {super.key, this.seed, this.comment});
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
  final focus = FocusNode();
  Map? replyTo;
  String _autoTag = '';
  final sc = ScrollController();
  Timer? _live;
  final _ck = <int, GlobalKey>{};
  int? _hl;

  @override
  void initState() {
    super.initState();
    _hl = widget.comment;
    a = widget.seed;
    text = widget.seed?.text ?? widget.seed?.desc ?? '';
    _load();
    _live = Timer.periodic(const Duration(seconds: 5), (_) => _silent());
    if (a != null) Store.i.countView(a!);
  }

  @override
  void dispose() { _live?.cancel(); input.dispose(); focus.dispose(); sc.dispose(); Store.i.leave(this); Store.i.leaveBgm(this); super.dispose(); }

  void _bgm() {
    final p = a;
    if (p != null && p.bgm && p.files.isNotEmpty) Store.i.playBgm(p.id, bgmUrl(p), scope: this);
  }

  Future<void> _load() async {
    try {
      final j = await Api.req('GET', '/posts/${widget.id}');
      a = A.from(j['post']);
      text = j['text'] ?? '';
      Store.i.countView(a!);
      await _comments();
      error = null;
      _bgm();
      if (_hl != null) { WidgetsBinding.instance.addPostFrameCallback((_) { final c = _ck[_hl]?.currentContext; if (c != null) Scrollable.ensureVisible(c, duration: const Duration(milliseconds: 350), alignment: .2); Future.delayed(const Duration(seconds: 3), () { if (mounted) setState(() => _hl = null); }); }); }
    } catch (e) {
      error = e is ApiErr && e.code == 'not_found' ? Store.i.t('post_gone') : Store.i.err(e);
    }
    if (mounted) setState(() => loading = false);
  }

  /// Real-time: komentar dan angka baru muncul sendiri tanpa memuat ulang halaman.
  Future<void> _silent() async {
    if (!mounted || loading || sending || (ModalRoute.of(context)?.isCurrent == false)) return;
    try {
      final p = await Api.req('GET', '/posts/${widget.id}');
      final cm = await Api.req('GET', '/posts/${widget.id}/comments');
      if (!mounted || sending) return;
      setState(() {
        a = A.from(p['post']);
        text = p['text'] ?? text;
        cmts = [for (final c in cm['items'] as List) Map.from(c as Map)];
      });
    } catch (_) {}
  }

  Future<void> _comments() async {
    final j = await Api.req('GET', '/posts/${widget.id}/comments');
    cmts = [for (final c in j['items'] as List) Map.from(c as Map)];
  }

  Future<void> _send() async {
    final s = Store.i, t = input.text.trim();
    if (t.isEmpty) return;
    if (t == _autoTag.trim()) return; // hanya tag, belum menulis apa-apa
    setState(() => sending = true);
    int? id;
    try {
      final j = await Api.req('POST', '/posts/${widget.id}/comments', body: {'text': t, 'parent': replyTo?['id']});
      id = (j['id'] as num).toInt();
      input.clear();
      replyTo = null;
      _autoTag = '';
      await _comments();
      final p = await Api.req('GET', '/posts/${widget.id}');
      a = A.from(p['post']);
    } catch (e) {
      if (id != null) { try { await Api.req('DELETE', '/comments/$id'); } catch (_) {} }
      toast(s.err(e), bad: true);
    }
    if (mounted) setState(() => sending = false);
  }

  /// Balas: komentar yang dibalas otomatis di-tag di awal tulisan.
  void _reply(Map c) {
    final tag = '@${c['username']} ';
    final cur = input.text;
    final body = cur.startsWith(_autoTag) ? cur.substring(_autoTag.length) : cur;
    _autoTag = tag;
    input.value = TextEditingValue(text: '$tag$body', selection: TextSelection.collapsed(offset: tag.length + body.length));
    setState(() => replyTo = c);
    focus.requestFocus();
  }

  Future<void> _delCmt(Map c) async {
    final s = Store.i;
    if (!await confirm(context, s.t('delete'), s.t('delete_cmt_q'), s.t('delete'), danger: true)) return;
    try {
      await Api.req('DELETE', '/comments/${c['id']}');
      cmts.removeWhere((e) => e['id'] == c['id']);
      await _comments();
      final p = await Api.req('GET', '/posts/${widget.id}');
      a = A.from(p['post']);
      if (replyTo != null && !cmts.any((e) => e['id'] == replyTo!['id'])) { replyTo = null; }
    } catch (e) { toast(s.err(e), bad: true); }
    if (mounted) setState(() {});
  }

  Future<void> _pinCmt(Map c) async {
    final s = Store.i;
    try {
      final j = await Api.req('POST', '/comments/${c['id']}/pin');
      for (final e in cmts) { e['pinned'] = false; }
      c['pinned'] = j['pinned'] == true;
      toast(s.t(c['pinned'] == true ? 'pinned' : 'unpin'));
    } catch (e) { toast(s.err(e), bad: true); }
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

  /// Urutan tampilan: komentar utama (yang disematkan di atas), lalu semua balasannya. Menjorok maksimal 3 tingkat; lebih dalam tetap terlihat karena otomatis memakai tag.
  List<(Map, int)> _flat() {
    final kids = <int, List<Map>>{};
    final ids = {for (final c in cmts) c['id'] as int};
    for (final c in cmts) {
      var p = c['parent'] as int;
      if (p != 0 && !ids.contains(p)) p = 0; // induk sudah terhapus: tampilkan sebagai komentar utama
      (kids[p] ??= []).add(c);
    }
    final top = [...(kids[0] ?? const <Map>[])]..sort((x, y) => (y['pinned'] == true ? 1 : 0) - (x['pinned'] == true ? 1 : 0));
    final out = <(Map, int)>[];
    void walk(Map c, int d) { out.add((c, d)); for (final k in kids[c['id'] as int] ?? const <Map>[]) { walk(k, d + 1); } }
    for (final c in top) { walk(c, 0); }
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
        MentionBar(input),
        if (replyTo != null) Padding(padding: const EdgeInsets.only(bottom: 6), child: Row(children: [
          Expanded(child: Text(s.t('replying').replaceAll('{n}', '${replyTo!['name']}'), style: TextStyle(color: acc(context), fontWeight: FontWeight.w700, fontSize: 13))),
          Tap(onTap: () { final cur = input.text; if (cur.startsWith(_autoTag)) input.text = cur.substring(_autoTag.length); _autoTag = ''; setState(() => replyTo = null); }, child: Icon(Icons.close_rounded, size: 18, color: sub(context))),
        ])),
        Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Expanded(child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16), decoration: BoxDecoration(color: soft(context), borderRadius: BorderRadius.circular(24)),
            child: TextField(controller: input, focusNode: focus, minLines: 1, maxLines: 5, textCapitalization: TextCapitalization.sentences, style: const TextStyle(fontSize: 15.5), cursorColor: ink(context), decoration: InputDecoration(border: InputBorder.none, hintText: s.t('comment_ph'), hintStyle: TextStyle(color: sub(context)))),
          )),
          const SizedBox(width: 8),
          Tap(onTap: sending ? null : _send, child: Container(width: 46, height: 46, decoration: BoxDecoration(color: btnBg(context), shape: BoxShape.circle), child: sending ? const Padding(padding: EdgeInsets.all(13), child: CircularProgressIndicator(strokeWidth: 2.2, color: cream)) : const Icon(Icons.arrow_upward_rounded, color: cream, size: 22))),
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
        if (text.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 14), child: MentionText(text, selectable: true, style: const TextStyle(fontSize: 17, height: 1.55))),
        if (p.files.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 6), child: audioBars(p, this)),
        const SizedBox(height: 10),
        PostActions(p, onComments: () { focus.requestFocus(); }),
        Divider(color: ink(context).withValues(alpha: .08), height: 24),
        Text('${s.t('comments')} (${p.comments})', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
        const SizedBox(height: 10),
        if (cmts.isEmpty) Padding(padding: const EdgeInsets.symmetric(vertical: 24), child: Center(child: Text(s.t('empty_cmt'), style: TextStyle(color: sub(context)), textAlign: TextAlign.center))),
        for (final e in _flat()) KeyedSubtree(key: _ck.putIfAbsent(e.$1['id'] as int, () => GlobalKey()), child: Container(decoration: BoxDecoration(color: _hl == e.$1['id'] ? acc(context).withValues(alpha: .12) : null, borderRadius: BorderRadius.circular(16)), child: CommentTile(e.$1, e.$2 > 3 ? 3 : e.$2, key: ValueKey('c${e.$1['id']}'), postId: p.id, postOwner: p.owner, scope: this, onReply: () => _reply(e.$1), onLike: () => _likeCmt(e.$1), onDelete: () => _delCmt(e.$1), onPin: () => _pinCmt(e.$1)))),
      ])),
      _composer(s),
    ]));
  }
}

class CommentTile extends StatefulWidget {
  final Map c;
  final int depth;
  final String postOwner;
  final int postId;
  final Object? scope;
  final VoidCallback onReply, onLike, onDelete, onPin;
  const CommentTile(this.c, this.depth, {super.key, required this.postId, required this.postOwner, this.scope, required this.onReply, required this.onLike, required this.onDelete, required this.onPin});
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

  void _menu() {
    final s = Store.i, c = widget.c;
    final iAmOwner = s.me?.username == widget.postOwner;
    sheet(context, (ctx) => Column(mainAxisSize: MainAxisSize.min, children: [
      PBtn(s.t('share'), () { Navigator.pop(ctx); shareUrl(commentLink(widget.postId, c['id'] as int)); }, ghost: true, icon: Icons.ios_share_rounded), const SizedBox(height: 10),
      if (iAmOwner && (c['parent'] as int) == 0) ...[PBtn(s.t(c['pinned'] == true ? 'unpin' : 'pin'), () { Navigator.pop(ctx); widget.onPin(); }, ghost: true, icon: Icons.push_pin_outlined), const SizedBox(height: 10)],
      if (c['mine'] == true || iAmOwner) PBtn(s.t('delete'), () { Navigator.pop(ctx); widget.onDelete(); }, ghost: true, icon: Icons.delete_outline_rounded, fgc: heart),
      if (c['mine'] != true && s.me != null) ...[if (iAmOwner) const SizedBox(height: 10), PBtn(s.t('report_cmt'), () { Navigator.pop(ctx); reportSheet(context, comment: c['id'] as int); }, ghost: true, icon: Icons.flag_outlined)],
    ]));
  }

  @override
  Widget build(BuildContext context) {
    final s = Store.i, c = widget.c;
    final liked = c['liked'] == true;
    final isAuthor = '${c['username']}' == widget.postOwner;
    final audios = [for (final x in (c['audios'] as List? ?? const [])) Map.from(x as Map)];
    final shown = full ?? '${c['text']}';
    const canMenu = true;
    return Padding(
      padding: EdgeInsets.only(left: widget.depth * 16.0, bottom: 14),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        if (widget.depth > 0) Container(width: 2, height: 34, margin: const EdgeInsets.only(right: 10, top: 4), decoration: BoxDecoration(color: ink(context).withValues(alpha: .12), borderRadius: BorderRadius.circular(1))),
        Tap(onTap: () => go(context, ProfilePage('${c['username']}')), child: Avatar(c['avatar'], '${c['name']}', 34)),
        const SizedBox(width: 10),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Flexible(child: Text('${c['name']}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5))),
            if (c['verified'] == true) const Padding(padding: EdgeInsets.only(left: 3), child: Icon(Icons.verified_rounded, size: 14, color: blue)),
            if (isAuthor) Container(margin: const EdgeInsets.only(left: 6), padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2), decoration: BoxDecoration(color: ink(context), borderRadius: BorderRadius.circular(8)), child: Text(s.t('author'), style: TextStyle(color: bgOf(context), fontSize: 10.5, fontWeight: FontWeight.w800))),
            const SizedBox(width: 8),
            Flexible(child: Text(s.when((c['created'] as num).toInt()), maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: sub(context), fontSize: 12))),
          ]),
          if (c['pinned'] == true) Padding(padding: const EdgeInsets.only(top: 2), child: Row(children: [Icon(Icons.push_pin_rounded, size: 12, color: sub(context)), const SizedBox(width: 4), Text(s.t('pinned'), style: TextStyle(color: sub(context), fontSize: 11.5, fontWeight: FontWeight.w700))])),
          if (shown.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 3), child: MentionText(shown, selectable: true, style: const TextStyle(fontSize: 15, height: 1.45))),
          if (c['long'] == true && full == null) Tap(onTap: loadingFull ? null : _full, child: Padding(padding: const EdgeInsets.only(top: 4), child: Text(loadingFull ? '…' : s.t('read_more'), style: TextStyle(color: acc(context), fontWeight: FontWeight.w700, fontSize: 13.5)))),
          for (var i = 0; i < audios.length; i++) FileBar(-(1000000000 + (c['id'] as int) * 4 + i), '${audios[i]['url']}', (audios[i]['secs'] as num).toInt(), scope: widget.scope),
          Row(children: [
            ActBtn(HK.sorot, widget.onLike, on: liked, count: (c['likes'] as num).toInt()),
            Tap(onTap: s.me == null ? () => toast(s.t('need_login')) : widget.onReply, child: Padding(padding: const EdgeInsets.all(8), child: Text(s.t('reply'), style: TextStyle(color: sub(context), fontWeight: FontWeight.w700, fontSize: 13)))),
            const Spacer(),
            if (canMenu) Tap(onTap: _menu, child: Padding(padding: const EdgeInsets.all(8), child: Icon(Icons.more_horiz_rounded, size: 20, color: sub(context)))),
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
  static const maxText = 1000;
  final text = TextEditingController();
  AudioClip? clip;
  final pv = AudioPlayer();
  bool playing = false, pprof = true, busy = false;
  String rand = 'public';
  Map<String, Map> picked = {};

  @override
  void initState() { super.initState(); pv.onPlayerComplete.listen((_) { if (mounted) setState(() => playing = false); }); text.addListener(() { if (mounted) setState(() {}); }); }
  @override
  void dispose() { text.dispose(); pv.dispose(); super.dispose(); }

  Future<void> _add() async {
    final c = await sheet<AudioClip>(context, (_) => const RecordSheet());
    if (c == null || !mounted) return;
    await pv.stop();
    setState(() { clip = c; playing = false; });
  }

  Future<void> _play() async {
    final c = clip;
    if (c == null) return;
    if (playing) { await pv.stop(); setState(() => playing = false); return; }
    setState(() => playing = true);
    await pv.play(BytesSource(c.bytes, mimeType: mimeOf(c.bytes)));
  }

  Future<void> _pickAcc() async {
    final r = await sheet<Map<String, Map>>(context, (_) => AccountPickSheet(Map.of(picked)));
    if (r == null || !mounted) return;
    setState(() { picked = r; if (r.isEmpty) { final l = audSplit(rand)..remove('accounts'); rand = l.isEmpty ? 'public' : l.join(','); } });
  }

  Future<void> _send() async {
    final s = Store.i, t = text.text.trim();
    final c = clip;
    if (c == null) { toast(s.t('e_need_audio'), bad: true); return; }
    if (t.length > maxText) { toast(s.t('e_too_long'), bad: true); return; }
    if (audSplit(rand).contains('accounts') && picked.isEmpty) { toast(s.t('e_need_accounts'), bad: true); return; }
    setState(() => busy = true);
    int? id;
    try {
      final j = await Api.req('POST', '/posts', body: {'text': t, 'audios': 1, 'pprof': pprof, 'rand': audSplit(rand), 'to': picked.keys.toList()});
      id = (j['id'] as num).toInt();
      await Api.multi('/posts/$id/audio', c.bytes, 'a.${c.ext}', {'secs': '${c.secs}'});
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
    final hasAcc = audSplit(rand).contains('accounts');
    return Scaffold(body: Column(children: [
      TopBar(back: true, title: s.t('new_post')),
      Expanded(child: ListView(padding: const EdgeInsets.fromLTRB(22, 4, 22, 40), children: [
        _AudioSlot(clip: clip, playing: playing, onPlay: _play, onPick: busy ? null : _add, onClear: () { pv.stop(); setState(() { clip = null; playing = false; }); }),
        const SizedBox(height: 14),
        Container(
          padding: const EdgeInsets.fromLTRB(18, 8, 18, 8), decoration: BoxDecoration(color: soft(context), borderRadius: BorderRadius.circular(22)),
          child: TextField(controller: text, minLines: 4, maxLines: 12, maxLength: maxText, buildCounter: (_, {required currentLength, required isFocused, maxLength}) => Align(alignment: Alignment.centerRight, child: Padding(padding: const EdgeInsets.only(bottom: 4), child: Text('$currentLength/$maxLength', style: TextStyle(color: currentLength > (maxLength ?? 0) * .9 ? const Color(0xFFD9534F) : sub(context), fontSize: 12)))), textCapitalization: TextCapitalization.sentences, style: const TextStyle(fontSize: 16.5, height: 1.5), cursorColor: ink(context), decoration: InputDecoration(border: InputBorder.none, hintText: s.t('write_hups'), hintStyle: TextStyle(color: sub(context)))),
        ),
        const SizedBox(height: 6),
        MentionBar(text),
        Padding(padding: const EdgeInsets.only(left: 6, bottom: 14), child: Text(s.t('tag_hint'), style: TextStyle(color: sub(context), fontSize: 12.5))),
        _row(s.t('pprof'), pprof, (v) => setState(() => pprof = v)),
        const SizedBox(height: 2),
        Pick(s.t('who_see'), rand, (v) async {
          setState(() => rand = v);
          if (audSplit(v).contains('accounts') && picked.isEmpty) { await _pickAcc(); }
        }, opts: uploadAud),
        if (hasAcc) Padding(padding: const EdgeInsets.only(top: 10), child: Tap(onTap: _pickAcc, scale: .98, child: Container(
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
