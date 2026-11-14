import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'core.dart';
import 'hups.dart';
import 'routes.dart';
import 'ui.dart';

/// Deteksi tautan di teks bebas: http(s)://…, www.…, atau domain tanpa https (mis. hulhup.my.id).
final linkRe = RegExp(
    r'(?<![@\w./-])((?:https?:\/\/)[^\s<>"]+|(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:com|id|net|org|io|app|dev|co|me|xyz|link|site|online|tv|ai|gg|ly|info|biz|my\.id|web\.id|co\.id|go\.id|ac\.id|sch\.id)(?::\d+)?(?:\/[^\s<>"]*)?)',
    caseSensitive: false);

/// Pisahkan tanda baca di ujung tautan agar tidak ikut ("hulhup.my.id," → "hulhup.my.id").
String trimLink(String s) {
  var t = s;
  while (t.isNotEmpty && '.,;:!?)]}\'"'.contains(t[t.length - 1])) { t = t.substring(0, t.length - 1); }
  return t;
}

Uri? linkUri(String raw) {
  final t = raw.trim();
  final u = Uri.tryParse(RegExp(r'^https?://', caseSensitive: false).hasMatch(t) ? t : 'https://$t');
  if (u == null || u.host.isEmpty || (u.scheme != 'http' && u.scheme != 'https')) return null;
  return u;
}

/// Buka tautan: halaman Hulhup dibuka di dalam aplikasi, situs lain lewat peramban dalam aplikasi.
Future<void> openLink(BuildContext context, String raw) async {
  final u = linkUri(raw);
  if (u == null) return;
  final h = u.host.toLowerCase();
  if (h == 'hulhup.my.id' || h == 'www.hulhup.my.id') {
    final w = pageFor(u.path.isEmpty ? '/' : u.path);
    if (w != null) { go(context, w); return; }
  }
  if (kIsWeb) { await launchUrl(u, mode: LaunchMode.platformDefault, webOnlyWindowName: '_blank'); return; }
  go(context, BrowserPage(u.toString()));
}

class BrowserPage extends StatefulWidget {
  final String url;
  const BrowserPage(this.url, {super.key});
  @override
  State<BrowserPage> createState() => _BrowserState();
}

class _BrowserState extends State<BrowserPage> {
  late final WebViewController c;
  int progress = 0;
  String title = '', cur = '';

  @override
  void initState() {
    super.initState();
    cur = widget.url;
    c = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(NavigationDelegate(
        onProgress: (p) { if (mounted) setState(() => progress = p); },
        onUrlChange: (ch) { if (mounted) setState(() => cur = ch.url ?? cur); },
        onPageFinished: (_) async { final t = await c.getTitle(); if (mounted) setState(() => title = t ?? ''); },
        onNavigationRequest: (r) {
          final s = Uri.tryParse(r.url)?.scheme;
          return (s == 'http' || s == 'https' || s == 'about') ? NavigationDecision.navigate : NavigationDecision.prevent;
        },
      ))
      ..loadRequest(Uri.parse(widget.url));
  }

  @override
  Widget build(BuildContext context) {
    final s = Store.i;
    final host = Uri.tryParse(cur)?.host ?? '';
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) async { if (didPop) return; if (await c.canGoBack()) { c.goBack(); } else if (context.mounted) { Navigator.pop(context); } },
      child: Scaffold(body: Column(children: [
        SafeArea(bottom: false, child: Padding(padding: const EdgeInsets.fromLTRB(4, 4, 4, 4), child: Row(children: [
          IconBtn(Icons.close_rounded, () => Navigator.pop(context)),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title.isEmpty ? host : title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
            Text(host, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: sub(context), fontSize: 12)),
          ])),
          IconBtn(Icons.refresh_rounded, () => c.reload()),
          IconBtn(Icons.content_copy_rounded, () { Clipboard.setData(ClipboardData(text: cur)); toast(s.t('link_copied')); }),
          IconBtn(Icons.open_in_new_rounded, () => launchUrl(Uri.parse(cur), mode: LaunchMode.externalApplication)),
        ]))),
        if (progress < 100) LinearProgressIndicator(value: progress / 100, minHeight: 2, color: ink(context), backgroundColor: Colors.transparent),
        Expanded(child: WebViewWidget(controller: c)),
      ])),
    );
  }
}

// ---------- lupa kata sandi ----------
class RecoverPage extends StatefulWidget {
  const RecoverPage({super.key});
  @override
  State<RecoverPage> createState() => _RecoverState();
}

class _RecoverState extends State<RecoverPage> {
  final user = TextEditingController(), code = TextEditingController(), pw = TextEditingController();
  bool busy = false;

  Future<void> _go() async {
    final s = Store.i;
    setState(() => busy = true);
    try {
      final j = await Api.req('POST', '/recover', body: {'username': user.text, 'code': code.text, 'password': pw.text});
      if (!mounted) return;
      await showRecoveryCode(context, '${j['recovery']}', fresh: true);
      if (!mounted) return;
      Navigator.pop(context);
      toast(s.t('recover_ok'));
    } catch (e) {
      toast(s.err(e), bad: true);
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = Store.i;
    return Scaffold(body: Column(children: [
      TopBar(back: true, title: s.t('recover_title')),
      Expanded(child: ListView(padding: const EdgeInsets.fromLTRB(24, 8, 24, 40), children: [
        Text(s.t('recover_hint'), style: TextStyle(color: sub(context), height: 1.45)),
        const SizedBox(height: 20),
        Field(s.t('username'), user, max: 20), const SizedBox(height: 16),
        Field(s.t('recovery_code'), code, max: 14), const SizedBox(height: 16),
        Field(s.t('new_password'), pw, secret: true), const SizedBox(height: 28),
        PBtn(s.t('recover_do'), _go, loading: busy),
      ])),
    ]));
  }
}

/// Tampilkan kode pemulihan (hanya sekali) dengan tombol salin.
Future<void> showRecoveryCode(BuildContext context, String code, {bool fresh = false}) {
  final s = Store.i;
  return sheet<void>(context, (ctx) => Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(s.t(fresh ? 'rec_new' : 'rec_show_title'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
        const SizedBox(height: 8),
        Text(s.t('rec_show_note'), style: TextStyle(color: sub(ctx), height: 1.4)),
        const SizedBox(height: 16),
        Container(width: double.infinity, padding: const EdgeInsets.symmetric(vertical: 18), decoration: BoxDecoration(color: soft(ctx), borderRadius: BorderRadius.circular(22)),
            child: Center(child: SelectableText(code, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800, letterSpacing: 2)))),
        const SizedBox(height: 14),
        PBtn(s.t('rec_copy'), () { Clipboard.setData(ClipboardData(text: code)); toast(s.t('link_copied')); }, ghost: true, icon: Icons.content_copy_rounded),
        const SizedBox(height: 10),
        PBtn(s.t('rec_saved'), () => Navigator.pop(ctx), icon: Icons.check_rounded),
      ]));
}

/// Buat kode pemulihan baru (kode lama hangus) setelah memasukkan kata sandi.
Future<void> newRecovery(BuildContext context) async {
  final s = Store.i;
  final pw = TextEditingController();
  final ok = await sheet<bool>(context, (ctx) => Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(s.t('rec_new'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
        const SizedBox(height: 8),
        Text(s.t('rec_new_note'), style: TextStyle(color: sub(ctx), height: 1.4)),
        const SizedBox(height: 14),
        Field(s.t('password'), pw, secret: true),
        const SizedBox(height: 16),
        PBtn(s.t('rec_new'), () => Navigator.pop(ctx, true)),
      ]));
  if (ok != true || !context.mounted) return;
  try {
    final j = await Api.req('POST', '/me/recovery', body: {'password': pw.text});
    if (context.mounted) await showRecoveryCode(context, '${j['recovery']}', fresh: true);
  } catch (e) { toast(s.err(e), bad: true); }
}

// ---------- FAQ ----------
class FaqPage extends StatelessWidget {
  const FaqPage({super.key});
  static const _id = [
    ('Apa itu Hulhup?', 'Ruang suara dan tulisan buatan Misyi. Ketuk tombol Acak untuk mendengar suara singkat dari orang lain, atau buka Hups untuk menjelajah post, komentar, dan balasan.'),
    ('Apa bedanya Acak dan Hups?', 'Acak memilih satu post secara acak 100% rata, bisa berupa audio, teks saja, atau post dengan backsound. Hups adalah linimasa; urutannya dipengaruhi waktu (35%), sorot (25%), komentar (25%), dan kecocokan dengan pencarianmu (15%).'),
    ('Bisakah memposting teks saja?', 'Bisa. Post boleh berisi tulisan saja, audio saja, atau keduanya. Panjang tulisan tidak dibatasi; di kartu hanya tampil sebagian dan "Selengkapnya" membuka teks penuh.'),
    ('Apa itu backsound?', 'Audio pada post yang kamu pilih sebagai pengiring (saat menambah audio, nyalakan "Jadikan backsound"). Terputar otomatis saat post terlihat dan bisa dibisukan pembaca kapan saja. Kalau tidak dinyalakan, audio itu audio biasa yang diputar dengan tombol putar.'),
    ('Berapa batas audio?', 'Satu post maksimal 1 audio, 15 detik dan 1 MB. Komentar hanya tulisan, tanpa audio.'),
    ('Apa arti "dilihat" dan "diputar"?', 'Jumlah akun yang melihat dan memutar post. Tiap akun dihitung satu kali, seberapa sering pun melihat atau memutar. "Diputar" hanya ada pada post dengan audio biasa.'),
    ('Apa itu sorot?', 'Tanda suka. Ketuk ikon lampu sorot untuk menyorot sebuah post atau komentar.'),
    ('Apa yang bisa dicari?', 'Semuanya: nama atau nama pengguna akun, bio, isi post, penulis, tag @nama, dan isi komentar. Beberapa kata dicocokkan sekaligus.'),
    ('Bisakah dipakai tanpa internet?', 'Aplikasi tetap terbuka. Acak dan Offline memutar post yang kamu simpan sendiri di perangkat. Pencarian, Pengaturan, Edit profil, Hups, dan membuat post butuh internet.'),
    ('Bagaimana menandai akun?', 'Ketik @nama pengguna di post atau komentar. Ketuk tag untuk membuka akun itu; akun yang ditandai mendapat notifikasi.'),
    ('Siapa yang bisa melihat post saya?', 'Kamu memilih saat membuat post, bisa lebih dari satu (publik, pengikut, hubungan, akun tertentu, dan lainnya).'),
    ('Bagaimana menyematkan komentar?', 'Penulis post membuka menu komentar lalu memilih Sematkan komentar.'),
    ('Bagaimana melaporkan konten?', 'Buka menu pada post atau komentar, lalu pilih Laporkan.'),
    ('Apa itu tanda AI?', 'Deks memeriksa audio dan foto dari bukti di dalam berkasnya. Bila ada bukti kuat, muncul tanda seperti "Audio oleh AI". Tanpa bukti, tidak ada tanda.'),
    ('Saya lupa kata sandi.', 'Di halaman masuk pilih Lupa kata sandi, lalu masukkan nama pengguna dan kode pemulihan yang diberikan saat mendaftar. Kode baru dibuat tiap dipakai. Tidak ada email, jadi simpan kodenya.'),
    ('Bagaimana membagikan post atau akun?', 'Setiap post dan akun punya alamat sendiri, misalnya hulhup.my.id/p/18 atau hulhup.my.id/u/nama. Tautan itu terbuka langsung di halaman yang dituju.'),
    ('Bagaimana menghapus notifikasi?', 'Di Notifikasi ketuk Pilih untuk memilih beberapa, atau Hapus semua.'),
  ];
  static const _en = [
    ('What is Hulhup?', 'A home for voices and writing by Misyi. Tap Random to hear a short voice from someone else, or open Hups to browse posts, comments and replies.'),
    ('Random vs Hups?', 'Random picks one post 100% evenly at random: an audio post, a text-only post, or a post with a backsound. Hups is a timeline ranked by recency (35%), spotlights (25%), comments (25%) and how well a post matches your searches (15%).'),
    ('Can I post text only?', 'Yes. A post can hold text only, audio only, or both. Text length is not limited; a card shows part of it and "Read more" opens the full text.'),
    ('What is a backsound?', 'The audio of a post that you choose as a soundtrack (when adding audio, turn on "Use as backsound"). It plays automatically while the post is in view and readers can mute it anytime. If you leave it off, the audio is a regular audio played with the play button.'),
    ('Audio limits?', 'A post has at most 1 audio, 15 seconds and 1 MB. Comments are text only, no audio.'),
    ('What do "views" and "plays" mean?', 'The number of accounts that viewed and played a post. Each account counts once, however often it views or plays. "Plays" only exists on posts with a regular audio.'),
    ('What is a spotlight?', 'A like. Tap the spotlight icon on a post or comment.'),
    ('What can I search?', 'Everything: account names and usernames, bios, post text, authors, @tags and comment text. Several words are matched together.'),
    ('Can I use it offline?', 'The app still opens. Random plays audio that was saved automatically on your device, and Offline audio can be played. Search, Settings, Edit profile, Hups and posting need internet.'),
    ('How do I tag someone?', 'Type @username in a post or comment. Tap a tag to open that account; tagged accounts get a notification.'),
    ('Who can see my posts?', 'You choose when posting, and can pick more than one (public, followers, relations, specific accounts, and more).'),
    ('How do I pin a comment?', 'The post author opens the comment menu and picks Pin comment.'),
    ('How do I report content?', 'Open the menu on a post or comment and choose Report.'),
    ('What is the AI mark?', 'Deks checks audio and photos for evidence inside the file. With strong evidence a mark such as "Audio by AI" appears. Without evidence, no mark.'),
    ('I forgot my password.', 'On the sign-in page choose Forgot password, then enter your username and the recovery code given at sign-up. A new code is issued each time. There is no email, so keep the code safe.'),
    ('How do I share a post or profile?', 'Every post and account has its own address, e.g. hulhup.my.id/p/18 or hulhup.my.id/u/name. The link opens straight to that page.'),
    ('How do I delete notifications?', 'In Notifications tap Select to choose several, or Delete all.'),
  ];

  @override
  Widget build(BuildContext context) {
    final s = Store.i;
    final qa = s.lang == 'id' ? _id : _en;
    return Scaffold(body: Column(children: [
      const TopBar(back: true, title: 'FAQ'),
      Expanded(child: ListView(padding: const EdgeInsets.fromLTRB(18, 4, 18, 40), children: [
        for (final e in qa) Container(
          margin: const EdgeInsets.only(bottom: 10), decoration: BoxDecoration(color: soft(context), borderRadius: BorderRadius.circular(22)),
          child: Theme(data: Theme.of(context).copyWith(dividerColor: Colors.transparent), child: ExpansionTile(
            tilePadding: const EdgeInsets.symmetric(horizontal: 18), childrenPadding: const EdgeInsets.fromLTRB(18, 0, 18, 16), expandedAlignment: Alignment.centerLeft,
            title: Text(e.$1, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15.5)),
            children: [Text(e.$2, style: TextStyle(color: sub(context), height: 1.5, fontSize: 14.5))],
          )),
        ),
      ])),
    ]));
  }
}

// ---------- Terkirim: siapa saja yang pernah kamu kirimi ----------
class SentPage extends StatefulWidget {
  final String? to;
  const SentPage({super.key, this.to});
  @override
  State<SentPage> createState() => _SentState();
}

class _SentState extends State<SentPage> {
  List? people;
  List<A> posts = [];
  String? error;
  @override
  void initState() { super.initState(); _load(); }
  Future<void> _load() async {
    try {
      if (widget.to == null) {
        people = (await Api.req('GET', '/me/sent'))['people'] as List;
      } else {
        posts = [for (final e in (await Api.req('GET', '/me/sent?to=${Uri.encodeQueryComponent(widget.to!)}'))['audios'] as List) A.from(e)];
      }
    } catch (e) { error = Store.i.err(e); }
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final s = Store.i;
    final loading = widget.to == null ? people == null : false;
    return Scaffold(body: Column(children: [
      TopBar(back: true, title: widget.to == null ? s.t('sent_title') : '${s.t('sent_title')} · ${widget.to}'),
      Expanded(child: error != null ? Empty(Icons.cloud_off_rounded, error!) : loading ? const Loader() : widget.to == null
          ? (people!.isEmpty ? Empty(Icons.send_outlined, s.t('sent_none')) : ListView(padding: const EdgeInsets.fromLTRB(20, 4, 20, 40), children: [
              Padding(padding: const EdgeInsets.only(left: 6, bottom: 10), child: Text(s.t('sent_hint'), style: TextStyle(color: sub(context), fontSize: 13))),
              for (var i = 0; i < people!.length; i++) Builder(builder: (_) {
                final u = people![i] as Map;
                return In(i, Tap(onTap: () => go(context, SentPage(to: '${u['username']}')), scale: .98, child: Container(
                  margin: const EdgeInsets.only(bottom: 10), padding: const EdgeInsets.fromLTRB(12, 10, 16, 10), decoration: BoxDecoration(color: soft(context), borderRadius: BorderRadius.circular(24)),
                  child: Row(children: [
                    Avatar(u['avatar'], '${u['name']}', 44), const SizedBox(width: 12),
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text('${u['name']}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15.5)), Text(s.t('sent_n').replaceAll('{n}', '${u['n']}'), style: TextStyle(color: sub(context), fontSize: 13))])),
                    Icon(Icons.chevron_right_rounded, color: sub(context)),
                  ]),
                )));
              }),
            ]))
          : (posts.isEmpty ? Empty(Icons.send_outlined, s.t('sent_none')) : ListView(padding: const EdgeInsets.fromLTRB(20, 4, 20, 40), children: [for (var i = 0; i < posts.length; i++) PostCard(posts[i], key: ValueKey('t${posts[i].id}'), scope: this)]))),
    ]));
  }
}
