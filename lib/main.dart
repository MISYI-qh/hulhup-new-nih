import 'dart:async';
import 'dart:math';
import 'package:audioplayers/audioplayers.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';

const green = Color(0xFF163F2B);
const cream = Color(0xFFFBF6E9);

// ---------- data (lokal dulu; ganti Store dengan klien API saat backend siap) ----------
class Audio {
  final String id, owner, desc, path;
  final int secs;
  final bool popup;
  final String vis; // all | followers | me
  Audio(this.id, this.owner, this.desc, this.secs, {this.popup = true, this.vis = 'all', this.path = ''});
  String get title => desc.trim().isEmpty ? 'Audio' : desc.trim().split('\n').first;
}

const _s = <String, List<String>>{
  'guest': ['Akun tamu', 'Guest account'], 'login': ['Masuk / daftar', 'Sign in / up'],
  'logout': ['Keluar', 'Sign out'], 'upload': ['Unggah audio', 'Upload audio'],
  'audio': ['Audio', 'Audio'], 'liked': ['Disukai', 'Liked'], 'followers': ['Pengikut', 'Followers'],
  'following': ['Mengikuti', 'Following'], 'settings': ['Pengaturan', 'Settings'],
  'language': ['Bahasa', 'Language'], 'theme': ['Tampilan', 'Appearance'], 'system': ['Sistem', 'System'],
  'light': ['Cerah', 'Light'], 'dark': ['Gelap', 'Dark'], 'about': ['Tentang Hulhup', 'About Hulhup'],
  'policy': ['Kebijakan', 'Policy'], 'privacy': ['Privasi', 'Privacy'], 'record': ['Rekam', 'Record'],
  'pick': ['Pilih file', 'Pick file'], 'desc': ['Deskripsi', 'Description'], 'popup': ['Tampilkan popup saat diklik', 'Show popup on tap'],
  'who': ['Siapa boleh lihat di profil', 'Who can see in profile'], 'all': ['Semua', 'Everyone'],
  'fol': ['Pengikut', 'Followers'], 'me': ['Hanya aku', 'Only me'], 'noedit': ['Audio tidak bisa diedit, hanya dihapus.', 'Audio cannot be edited, only deleted.'],
  'search': ['Cari akun', 'Search accounts'], 'notif': ['Notifikasi', 'Notifications'], 'empty': ['Belum ada apa-apa', 'Nothing yet'],
  'name': ['Nama', 'Name'], 'handle': ['Nama pengguna', 'Username'], 'tooLong': ['Maksimal 30 detik', 'Max 30 seconds'],
  'aboutText': ['Ketuk, dengarkan suara acak dari seluruh dunia.', 'Tap and hear a random voice from around the world.'],
  'policyText': ['Isi kebijakan akan ditulis sebelum rilis.', 'Policy text will be written before release.'],
  'privacyText': ['Isi privasi akan ditulis sebelum rilis.', 'Privacy text will be written before release.'],
  'new': ['mulai mengikutimu', 'started following you'],
};

class Store extends ChangeNotifier {
  static final i = Store._();
  Store._();
  String? me;
  String lang = 'id';
  ThemeMode mode = ThemeMode.system;
  int taps = 12408;
  final users = <String, String>{'ranip': 'Rani Putri', 'dimas': 'Dimas A.', 'sari': 'Sari W.', 'bima': 'Bima S.'};
  final liked = <String>{};
  final notifs = <String>['ranip'];
  final _rnd = Random();
  final audios = <Audio>[
    Audio('1', 'ranip', 'Selamat pagi', 12), Audio('2', 'dimas', 'Suara ombak', 30),
    Audio('3', 'sari', 'Selamat malam', 9, popup: false), Audio('4', 'bima', 'Kucing mengeong', 5),
  ];
  String t(String k) => _s[k]![lang == 'id' ? 0 : 1];
  Audio? random() => audios.isEmpty ? null : audios[_rnd.nextInt(audios.length)];
  void login(String h, String n) { me = h; users[h] = n.isEmpty ? h : n; notifyListeners(); }
  void logout() { me = null; notifyListeners(); }
  void add(Audio a) { audios.insert(0, a); notifyListeners(); }
  void remove(String id) { audios.removeWhere((a) => a.id == id); liked.remove(id); notifyListeners(); }
  void like(String id) { liked.contains(id) ? liked.remove(id) : liked.add(id); notifyListeners(); }
  void tap() { taps++; notifyListeners(); }
  void set({String? l, ThemeMode? m}) { lang = l ?? lang; mode = m ?? mode; notifyListeners(); }
}

String fmt(int n) {
  final s = '$n', b = StringBuffer();
  for (var i = 0; i < s.length; i++) { if (i > 0 && (s.length - i) % 3 == 0) b.write('.'); b.write(s[i]); }
  return b.toString();
}

final _player = AudioPlayer();
Future<void> playAudio(Audio a) async {
  if (a.path.isEmpty) return; // contoh bawaan belum punya file suara
  await _player.stop();
  await _player.play(kIsWeb ? UrlSource(a.path) : DeviceFileSource(a.path));
}

Future<T?> go<T>(BuildContext c, Widget p) => Navigator.of(c).push<T>(PageRouteBuilder(
      transitionDuration: const Duration(milliseconds: 380),
      pageBuilder: (_, __, ___) => p,
      transitionsBuilder: (_, a, __, child) {
        final cu = CurvedAnimation(parent: a, curve: Curves.easeOutCubic);
        return FadeTransition(opacity: cu, child: SlideTransition(position: Tween(begin: const Offset(0, .04), end: Offset.zero).animate(cu), child: child));
      },
    ));

// ---------- app ----------
void main() => runApp(const HulhupApp());

ThemeData theme(bool dark) {
  final bg = dark ? const Color(0xFF0E1511) : const Color(0xFFFEFDF9);
  final ink = dark ? const Color(0xFFE9F1EA) : green;
  return ThemeData(
    useMaterial3: true,
    brightness: dark ? Brightness.dark : Brightness.light,
    scaffoldBackgroundColor: bg,
    colorScheme: ColorScheme.fromSeed(seedColor: green, brightness: dark ? Brightness.dark : Brightness.light, surface: bg, primary: dark ? const Color(0xFF8CC4A6) : green),
    appBarTheme: AppBarTheme(backgroundColor: bg, foregroundColor: ink, elevation: 0, scrolledUnderElevation: 0, centerTitle: true),
    drawerTheme: DrawerThemeData(backgroundColor: bg),
  );
}

class HulhupApp extends StatelessWidget {
  const HulhupApp({super.key});
  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: Store.i,
        builder: (_, __) => MaterialApp(
          title: 'Hulhup', debugShowCheckedModeBanner: false,
          themeMode: Store.i.mode, theme: theme(false), darkTheme: theme(true), home: const HomePage(),
        ),
      );
}

class Logo extends StatelessWidget {
  final double size; final Color color;
  const Logo(this.size, this.color, {super.key});
  @override
  Widget build(BuildContext context) {
    Widget bar(double h) => Container(width: size * .09, height: size * h, decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(size)));
    Widget dot() => Container(width: size * .11, height: size * .11, decoration: BoxDecoration(color: color, shape: BoxShape.circle));
    return SizedBox(width: size, height: size, child: Row(mainAxisAlignment: MainAxisAlignment.spaceEvenly, crossAxisAlignment: CrossAxisAlignment.center, children: [dot(), bar(.34), bar(.56), bar(.31), dot()]));
  }
}

class Header extends StatelessWidget implements PreferredSizeWidget {
  const Header({super.key});
  @override
  Size get preferredSize => const Size.fromHeight(60);
  @override
  Widget build(BuildContext context) {
    final p = Theme.of(context).colorScheme.primary;
    return AppBar(
      leading: IconButton(icon: const Icon(Icons.menu_rounded), onPressed: () => Scaffold.of(context).openDrawer()),
      title: Row(mainAxisSize: MainAxisSize.min, children: [
        Container(width: 28, height: 28, decoration: const BoxDecoration(color: green, shape: BoxShape.circle), child: const Logo(28, cream)),
        const SizedBox(width: 8),
        Text('Hulhup', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 20, letterSpacing: -.3, color: p)),
      ]),
      actions: [
        IconButton(icon: const Icon(Icons.search_rounded), onPressed: () => go(context, const SearchPage())),
        IconButton(icon: const Icon(Icons.person_outline_rounded), onPressed: () => go(context, ProfilePage(Store.i.me))),
      ],
    );
  }
}

// ---------- home ----------
class HomePage extends StatelessWidget {
  const HomePage({super.key});
  @override
  Widget build(BuildContext context) {
    final s = Store.i;
    return Scaffold(
      appBar: PreferredSize(preferredSize: const Size.fromHeight(60), child: Builder(builder: (c) => const Header())),
      drawer: const MenuDrawer(),
      body: Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          TapButton(onTap: () {
            final a = s.random();
            if (a == null) return;
            s.tap();
            playAudio(a);
            if (a.popup) showModalBottomSheet(context: context, backgroundColor: Colors.transparent, builder: (_) => PopupCard(a));
          }),
          const SizedBox(height: 18),
          ListenableBuilder(
            listenable: s,
            builder: (_, __) => AnimatedSwitcher(
              duration: const Duration(milliseconds: 280),
              transitionBuilder: (w, a) => FadeTransition(opacity: a, child: ScaleTransition(scale: Tween(begin: .85, end: 1.0).animate(a), child: w)),
              child: Text(fmt(s.taps), key: ValueKey(s.taps), style: TextStyle(fontSize: 34, fontWeight: FontWeight.w800, letterSpacing: -1, color: Theme.of(context).colorScheme.primary)),
            ),
          ),
        ]),
      ),
    );
  }
}

class TapButton extends StatefulWidget {
  final VoidCallback onTap;
  const TapButton({super.key, required this.onTap});
  @override
  State<TapButton> createState() => _TapButtonState();
}

class _TapButtonState extends State<TapButton> with TickerProviderStateMixin {
  late final idle = AnimationController(vsync: this, duration: const Duration(seconds: 4))..repeat();
  late final burst = AnimationController(vsync: this, duration: const Duration(milliseconds: 900));
  bool down = false;
  @override
  void dispose() { idle.dispose(); burst.dispose(); super.dispose(); }
  @override
  Widget build(BuildContext context) {
    final ring = Theme.of(context).colorScheme.primary;
    return SizedBox(
      width: 320, height: 320,
      child: Stack(alignment: Alignment.center, children: [
        AnimatedBuilder(animation: Listenable.merge([idle, burst]), builder: (_, __) => CustomPaint(size: const Size(320, 320), painter: _Rings(idle.value, burst.value, ring))),
        GestureDetector(
          onTapDown: (_) => setState(() => down = true),
          onTapCancel: () => setState(() => down = false),
          onTapUp: (_) => setState(() => down = false),
          onTap: () { HapticFeedback.lightImpact(); burst.forward(from: 0); widget.onTap(); },
          child: AnimatedScale(
            scale: down ? .94 : 1, duration: const Duration(milliseconds: 140), curve: Curves.easeOut,
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 140), width: 200, height: 200,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: const RadialGradient(center: Alignment(-.36, -.52), radius: 1.1, colors: [Color(0xFF3C7357), Color(0xFF235A3E), green, Color(0xFF0F2E1F)], stops: [0, .38, .75, 1]),
                boxShadow: [BoxShadow(color: green.withOpacity(down ? .2 : .34), blurRadius: down ? 24 : 50, offset: Offset(0, down ? 10 : 26))],
              ),
              child: const Center(child: Logo(92, cream)),
            ),
          ),
        ),
      ]),
    );
  }
}

class _Rings extends CustomPainter {
  final double t, b; final Color c;
  _Rings(this.t, this.b, this.c);
  @override
  void paint(Canvas canvas, Size size) {
    final o = size.center(Offset.zero);
    for (var i = 0; i < 3; i++) {
      final k = (t + i / 3) % 1;
      canvas.drawCircle(o, 104 + k * 50, Paint()..style = PaintingStyle.stroke..strokeWidth = 1.2..color = c.withOpacity((1 - k) * .16));
    }
    if (b > 0 && b < 1) canvas.drawCircle(o, 100 + b * 60, Paint()..style = PaintingStyle.stroke..strokeWidth = 2.2..color = c.withOpacity((1 - b) * .4));
  }
  @override
  bool shouldRepaint(_Rings o) => true;
}

// ---------- popup ----------
class PopupCard extends StatefulWidget {
  final Audio a;
  const PopupCard(this.a, {super.key});
  @override
  State<PopupCard> createState() => _PopupCardState();
}

class _PopupCardState extends State<PopupCard> with SingleTickerProviderStateMixin {
  late final c = AnimationController(vsync: this, duration: Duration(seconds: widget.a.secs))..forward();
  @override
  void dispose() { c.dispose(); super.dispose(); }
  @override
  Widget build(BuildContext context) {
    final a = widget.a, s = Store.i, th = Theme.of(context), p = th.colorScheme.primary;
    return Container(
      margin: const EdgeInsets.all(12), padding: const EdgeInsets.fromLTRB(18, 10, 18, 18),
      decoration: BoxDecoration(color: th.brightness == Brightness.dark ? const Color(0xFF17211B) : Colors.white, borderRadius: BorderRadius.circular(28), boxShadow: [BoxShadow(color: green.withOpacity(.16), blurRadius: 40)]),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Container(width: 36, height: 4, margin: const EdgeInsets.only(bottom: 14), decoration: BoxDecoration(color: p.withOpacity(.2), borderRadius: BorderRadius.circular(2))),
        InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: () { Navigator.pop(context); go(context, ProfilePage(a.owner)); },
          child: Row(children: [
            CircleAvatar(backgroundColor: green, foregroundColor: cream, child: Text((s.users[a.owner] ?? '?')[0])),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(s.users[a.owner] ?? a.owner, style: const TextStyle(fontWeight: FontWeight.w800)), Text('@${a.owner}', style: TextStyle(color: p.withOpacity(.6), fontSize: 13))])),
            Icon(Icons.chevron_right_rounded, color: p.withOpacity(.5)),
          ]),
        ),
        const SizedBox(height: 14),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          decoration: BoxDecoration(color: p.withOpacity(.07), borderRadius: BorderRadius.circular(18)),
          child: Row(children: [
            IconButton.filled(style: IconButton.styleFrom(backgroundColor: green, foregroundColor: cream), icon: const Icon(Icons.replay_rounded), onPressed: () { c.forward(from: 0); playAudio(a); }),
            Expanded(child: AnimatedBuilder(animation: c, builder: (_, __) => Padding(padding: const EdgeInsets.symmetric(horizontal: 10), child: ClipRRect(borderRadius: BorderRadius.circular(4), child: LinearProgressIndicator(value: c.value, minHeight: 6, backgroundColor: p.withOpacity(.12)))))),
            Text('0:${a.secs.toString().padLeft(2, '0')}', style: TextStyle(color: p.withOpacity(.7), fontSize: 13)),
            ListenableBuilder(listenable: s, builder: (_, __) => IconButton(icon: Icon(s.liked.contains(a.id) ? Icons.favorite_rounded : Icons.favorite_border_rounded), onPressed: () => s.like(a.id))),
          ]),
        ),
      ]),
    );
  }
}

// ---------- menu ----------
class MenuDrawer extends StatelessWidget {
  const MenuDrawer({super.key});
  @override
  Widget build(BuildContext context) {
    final s = Store.i;
    Widget chip(String t, bool on, VoidCallback f) => ChoiceChip(label: Text(t), selected: on, onSelected: (_) => f(), showCheckmark: false);
    Widget label(String t) => Padding(padding: const EdgeInsets.fromLTRB(24, 18, 24, 8), child: Text(t, style: TextStyle(color: Theme.of(context).colorScheme.primary.withOpacity(.6), fontSize: 13)));
    Widget item(String k, String body) => ListTile(title: Text(s.t(k), style: const TextStyle(fontWeight: FontWeight.w600)), trailing: const Icon(Icons.chevron_right_rounded), onTap: () { Navigator.pop(context); go(context, TextPage(s.t(k), s.t(body))); });
    return Drawer(
      width: 300,
      child: SafeArea(
        child: ListenableBuilder(
          listenable: s,
          builder: (_, __) => ListView(children: [
            Padding(padding: const EdgeInsets.fromLTRB(24, 16, 24, 4), child: Row(children: [Container(width: 34, height: 34, decoration: const BoxDecoration(color: green, shape: BoxShape.circle), child: const Logo(34, cream)), const SizedBox(width: 10), const Text('Hulhup', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 20))])),
            label(s.t('settings')),
            ListTile(title: Text(s.t('guest') == 'x' ? '' : (s.me == null ? s.t('login') : s.t('logout')), style: const TextStyle(fontWeight: FontWeight.w600)), onTap: () { Navigator.pop(context); s.me == null ? loginDialog(context) : s.logout(); }),
            label(s.t('language')),
            Padding(padding: const EdgeInsets.symmetric(horizontal: 20), child: Wrap(spacing: 8, children: [chip('Indonesia', s.lang == 'id', () => s.set(l: 'id')), chip('English', s.lang == 'en', () => s.set(l: 'en'))])),
            label(s.t('theme')),
            Padding(padding: const EdgeInsets.symmetric(horizontal: 20), child: Wrap(spacing: 8, children: [chip(s.t('system'), s.mode == ThemeMode.system, () => s.set(m: ThemeMode.system)), chip(s.t('light'), s.mode == ThemeMode.light, () => s.set(m: ThemeMode.light)), chip(s.t('dark'), s.mode == ThemeMode.dark, () => s.set(m: ThemeMode.dark))])),
            const Divider(height: 32),
            item('about', 'aboutText'), item('policy', 'policyText'), item('privacy', 'privacyText'),
          ]),
        ),
      ),
    );
  }
}

class TextPage extends StatelessWidget {
  final String title, body;
  const TextPage(this.title, this.body, {super.key});
  @override
  Widget build(BuildContext context) => Scaffold(appBar: AppBar(title: Text(title)), body: Padding(padding: const EdgeInsets.all(24), child: Text(body, style: const TextStyle(fontSize: 16, height: 1.6))));
}

void loginDialog(BuildContext context) {
  final h = TextEditingController(), n = TextEditingController(), s = Store.i;
  showDialog(context: context, builder: (_) => AlertDialog(
    title: Text(s.t('login')),
    content: Column(mainAxisSize: MainAxisSize.min, children: [
      TextField(controller: h, decoration: InputDecoration(labelText: s.t('handle'))),
      TextField(controller: n, decoration: InputDecoration(labelText: s.t('name'))),
    ]),
    actions: [FilledButton(onPressed: () { final x = h.text.trim().toLowerCase(); if (x.isNotEmpty) { s.login(x, n.text.trim()); Navigator.pop(context); } }, child: const Text('OK'))],
  ));
}

// ---------- search ----------
class SearchPage extends StatefulWidget {
  const SearchPage({super.key});
  @override
  State<SearchPage> createState() => _SearchPageState();
}

class _SearchPageState extends State<SearchPage> {
  String q = '';
  @override
  Widget build(BuildContext context) {
    final s = Store.i;
    final r = s.users.entries.where((e) => e.key != s.me && (e.key.contains(q.toLowerCase()) || e.value.toLowerCase().contains(q.toLowerCase()))).toList();
    return Scaffold(
      appBar: AppBar(title: TextField(autofocus: true, onChanged: (v) => setState(() => q = v), decoration: InputDecoration(hintText: s.t('search'), border: InputBorder.none))),
      body: ListView(children: [for (final e in r) ListTile(leading: CircleAvatar(backgroundColor: green, foregroundColor: cream, child: Text(e.value[0])), title: Text(e.value, style: const TextStyle(fontWeight: FontWeight.w700)), subtitle: Text('@${e.key}'), onTap: () => go(context, ProfilePage(e.key)))]),
    );
  }
}

// ---------- profile ----------
class ProfilePage extends StatefulWidget {
  final String? handle;
  const ProfilePage(this.handle, {super.key});
  @override
  State<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends State<ProfilePage> {
  int tab = 0;
  @override
  Widget build(BuildContext context) {
    final s = Store.i, p = Theme.of(context).colorScheme.primary;
    return ListenableBuilder(listenable: s, builder: (_, __) {
      final h = widget.handle, mine = h != null && h == s.me;
      if (h == null) {
        return Scaffold(appBar: AppBar(), body: Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
          CircleAvatar(radius: 40, backgroundColor: p.withOpacity(.12), child: Icon(Icons.person_outline_rounded, size: 40, color: p)),
          const SizedBox(height: 14), Text(s.t('guest'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 20)),
          const SizedBox(height: 18), FilledButton(onPressed: () => loginDialog(context), child: Text(s.t('login'))),
        ])));
      }
      final list = tab == 1 ? s.audios.where((a) => s.liked.contains(a.id)).toList() : s.audios.where((a) => a.owner == h && (mine || a.vis == 'all')).toList();
      return Scaffold(
        appBar: AppBar(actions: [if (mine) IconButton(icon: Badge(smallSize: 8, child: const Icon(Icons.notifications_none_rounded)), onPressed: () => go(context, const NotifPage()))]),
        body: ListView(padding: EdgeInsets.zero, children: [
          Container(height: 120, decoration: const BoxDecoration(gradient: LinearGradient(colors: [green, Color(0xFF3A6B52)]))),
          Padding(padding: const EdgeInsets.symmetric(horizontal: 20), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Transform.translate(offset: const Offset(0, -40), child: CircleAvatar(radius: 42, backgroundColor: Theme.of(context).scaffoldBackgroundColor, child: CircleAvatar(radius: 38, backgroundColor: green, foregroundColor: cream, child: Text((s.users[h] ?? h)[0], style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w800))))),
            Transform.translate(offset: const Offset(0, -28), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(s.users[h] ?? h, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 22)),
              Text('@$h', style: TextStyle(color: p.withOpacity(.6))),
              const SizedBox(height: 12),
              Row(children: [Text('248 ', style: const TextStyle(fontWeight: FontWeight.w800)), Text(s.t('followers')), const SizedBox(width: 20), const Text('96 ', style: TextStyle(fontWeight: FontWeight.w800)), Text(s.t('following'))]),
              if (mine) ...[const SizedBox(height: 14), SizedBox(width: double.infinity, height: 48, child: FilledButton(style: FilledButton.styleFrom(backgroundColor: green, foregroundColor: cream, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))), onPressed: () => go(context, const UploadPage()), child: Text(s.t('upload'))))],
            ])),
          ])),
          if (mine) Row(children: [for (final e in [(0, s.t('audio')), (1, s.t('liked'))]) Expanded(child: InkWell(onTap: () => setState(() => tab = e.$1), child: AnimatedContainer(duration: const Duration(milliseconds: 220), padding: const EdgeInsets.all(12), alignment: Alignment.center, decoration: BoxDecoration(border: Border(bottom: BorderSide(width: 2, color: tab == e.$1 ? p : Colors.transparent))), child: Text(e.$2, style: TextStyle(fontWeight: tab == e.$1 ? FontWeight.w800 : FontWeight.w500)))))]),
          if (list.isEmpty) Padding(padding: const EdgeInsets.all(40), child: Center(child: Text(s.t('empty')))),
          for (final a in list) AudioRow(a, mine && tab == 0),
        ]),
      );
    });
  }
}

class AudioRow extends StatelessWidget {
  final Audio a; final bool deletable;
  const AudioRow(this.a, this.deletable, {super.key});
  @override
  Widget build(BuildContext context) {
    final s = Store.i;
    return ListTile(
      leading: IconButton.filled(style: IconButton.styleFrom(backgroundColor: green, foregroundColor: cream), icon: const Icon(Icons.play_arrow_rounded), onPressed: () => playAudio(a)),
      title: Text(a.title, style: const TextStyle(fontWeight: FontWeight.w700)),
      subtitle: Text('@${a.owner} · 0:${a.secs.toString().padLeft(2, '0')}'),
      trailing: deletable
          ? IconButton(icon: const Icon(Icons.delete_outline_rounded), onPressed: () => s.remove(a.id))
          : IconButton(icon: Icon(s.liked.contains(a.id) ? Icons.favorite_rounded : Icons.favorite_border_rounded), onPressed: () => s.like(a.id)),
    );
  }
}

class NotifPage extends StatelessWidget {
  const NotifPage({super.key});
  @override
  Widget build(BuildContext context) {
    final s = Store.i;
    return Scaffold(appBar: AppBar(title: Text(s.t('notif'))), body: ListView(children: [for (final h in s.notifs) ListTile(leading: CircleAvatar(backgroundColor: green, foregroundColor: cream, child: Text((s.users[h] ?? h)[0])), title: Text('${s.users[h] ?? h} ${s.t('new')}'))]));
  }
}

// ---------- upload ----------
class UploadPage extends StatefulWidget {
  const UploadPage({super.key});
  @override
  State<UploadPage> createState() => _UploadPageState();
}

class _UploadPageState extends State<UploadPage> {
  final rec = AudioRecorder();
  final desc = TextEditingController();
  String path = ''; int secs = 0; bool recording = false, popup = true; String vis = 'all'; Timer? timer;
  @override
  void dispose() { timer?.cancel(); rec.dispose(); desc.dispose(); super.dispose(); }

  Future<void> toggle() async {
    if (recording) return stop();
    if (!await rec.hasPermission()) return;
    final p = kIsWeb ? '' : '${(await getTemporaryDirectory()).path}/h${DateTime.now().millisecondsSinceEpoch}.m4a';
    await rec.start(const RecordConfig(), path: p);
    setState(() { recording = true; secs = 0; path = ''; });
    timer = Timer.periodic(const Duration(seconds: 1), (_) { setState(() => secs++); if (secs >= 30) stop(); });
  }

  Future<void> stop() async {
    timer?.cancel();
    final p = await rec.stop();
    setState(() { recording = false; path = p ?? ''; });
  }

  Future<void> pick() async {
    final r = await FilePicker.platform.pickFiles(type: FileType.audio);
    final f = r?.files.single.path;
    if (f == null) return;
    final pl = AudioPlayer();
    await pl.setSource(DeviceFileSource(f));
    final d = await pl.getDuration();
    await pl.dispose();
    if (d == null || d.inSeconds > 30) { if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(Store.i.t('tooLong')))); return; }
    setState(() { path = f; secs = d.inSeconds; });
  }

  @override
  Widget build(BuildContext context) {
    final s = Store.i, p = Theme.of(context).colorScheme.primary;
    return Scaffold(
      appBar: AppBar(title: Text(s.t('upload'))),
      body: ListView(padding: const EdgeInsets.all(20), children: [
        Row(children: [
          FilledButton.icon(style: FilledButton.styleFrom(backgroundColor: recording ? const Color(0xFFC8452B) : green, foregroundColor: cream), onPressed: toggle, icon: Icon(recording ? Icons.stop_rounded : Icons.mic_rounded), label: Text(s.t('record'))),
          const SizedBox(width: 10),
          if (!kIsWeb) OutlinedButton(onPressed: pick, child: Text(s.t('pick'))),
          const Spacer(),
          Text('0:${secs.toString().padLeft(2, '0')} / 0:30', style: const TextStyle(fontWeight: FontWeight.w800)),
        ]),
        const SizedBox(height: 10),
        ClipRRect(borderRadius: BorderRadius.circular(4), child: LinearProgressIndicator(value: secs / 30, minHeight: 6, backgroundColor: p.withOpacity(.12))),
        const SizedBox(height: 20),
        TextField(controller: desc, maxLength: 1000, maxLines: 4, decoration: InputDecoration(labelText: s.t('desc'), border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)))),
        SwitchListTile(contentPadding: EdgeInsets.zero, title: Text(s.t('popup')), value: popup, onChanged: (v) => setState(() => popup = v)),
        ListTile(contentPadding: EdgeInsets.zero, title: Text(s.t('who')), trailing: DropdownButton<String>(value: vis, underline: const SizedBox(), onChanged: (v) => setState(() => vis = v!), items: [DropdownMenuItem(value: 'all', child: Text(s.t('all'))), DropdownMenuItem(value: 'followers', child: Text(s.t('fol'))), DropdownMenuItem(value: 'me', child: Text(s.t('me')))])),
        const SizedBox(height: 10),
        SizedBox(height: 48, child: FilledButton(
          style: FilledButton.styleFrom(backgroundColor: green, foregroundColor: cream, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
          onPressed: (path.isEmpty || recording) ? null : () { s.add(Audio('${DateTime.now().millisecondsSinceEpoch}', s.me!, desc.text, max(secs, 1), popup: popup, vis: vis, path: path)); Navigator.pop(context); },
          child: Text(s.t('upload')),
        )),
        const SizedBox(height: 10),
        Center(child: Text(s.t('noedit'), style: TextStyle(color: p.withOpacity(.6), fontSize: 13))),
      ]),
    );
  }
}
