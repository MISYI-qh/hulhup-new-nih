import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/services.dart';
import 'package:ota_update/ota_update.dart';
import 'package:url_launcher/url_launcher.dart';
import 'core.dart';
import 'ui.dart';
import 'pages.dart';

class HomePage extends StatefulWidget {
  const HomePage({super.key});
  @override
  State<HomePage> createState() => _HomeState();
}

class _HomeState extends State<HomePage> {
  bool menu = false, _busy = false;

  Future<void> _tap() async {
    if (_busy) return;
    _busy = true;
    final s = Store.i;
    try {
      final a = await s.random();
      if (!mounted) return;
      if (a == null) { toast(s.t(s.fromOffline ? 'no_net_empty' : (s.me != null && s.filter != 'public') ? 'nofilter' : 'nobody')); return; }
      if (s.fromOffline) toast(s.t('no_net'));
      s.play(a, force: true).catchError((_) => toast(s.t('e_server'), bad: true));
      sheet(context, (_) => PopupBody(a)).then((_) { if (s.playing == a.id) s.stop(); });
    } catch (e) {
      toast(s.err(e), bad: true);
    } finally {
      _busy = false;
    }
  }

  Future<void> _filter() async {
    final s = Store.i;
    final r = await chooseSheet(context, s.t('filter_title'), filterAud, s.me == null ? 'public' : s.filter, filter: true);
    if (r == null) return;
    if (s.me == null && r != 'public') { toast(s.t('filter_login')); return; }
    await s.setFilter(r);
  }

  @override
  Widget build(BuildContext context) {
    final s = Store.i;
    return PopScope(
      canPop: !menu,
      onPopInvokedWithResult: (didPop, _) { if (!didPop && menu) setState(() => menu = false); },
      child: Scaffold(
      body: Stack(children: [
        Column(children: [
          TopBar(
            lead: IconBtn(Icons.menu_rounded, () => setState(() => menu = true)),
            center: const Brand(),
            actions: [IconBtn(Icons.search_rounded, () => go(context, const SearchPage())), ListenableBuilder(listenable: s, builder: (_, __) => IconBtn(Icons.person_outline_rounded, () => go(context, ProfilePage(s.me?.username)), dot: s.unread > 0))],
          ),
          ListenableBuilder(listenable: s, builder: (_, __) => !s.updateReady ? const SizedBox() : Padding(padding: const EdgeInsets.fromLTRB(20, 4, 20, 0), child: Tap(onTap: () => showUpdate(context), scale: .98, child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12), decoration: BoxDecoration(color: soft(context), borderRadius: BorderRadius.circular(18)),
            child: Row(children: [Icon(Icons.system_update_rounded, size: 20, color: ink(context)), const SizedBox(width: 12), Expanded(child: Text(s.t('upd_title'), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14))), Text(s.t('upd_btn'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14))]),
          )))),
          Expanded(child: Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
            TapButton(onTap: _tap),
            const SizedBox(height: 20),
            ListenableBuilder(listenable: s, builder: (_, __) => AnimatedSwitcher(
              duration: const Duration(milliseconds: 300),
              transitionBuilder: (w, a) => FadeTransition(opacity: a, child: SlideTransition(position: Tween(begin: const Offset(0, .3), end: Offset.zero).animate(a), child: w)),
              child: Text(fmt(s.taps), key: ValueKey(s.taps), style: TextStyle(fontSize: 38, fontWeight: FontWeight.w800, letterSpacing: -1.2, color: ink(context))),
            )),
            const SizedBox(height: 16),
            ListenableBuilder(listenable: s, builder: (_, __) {
              final f = s.me == null ? 'public' : s.filter;
              return Tap(onTap: _filter, scale: .96, child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9), decoration: BoxDecoration(color: soft(context), borderRadius: BorderRadius.circular(22)),
                child: Row(mainAxisSize: MainAxisSize.min, children: [Icon(audIcon(f, filter: true), size: 16, color: ink(context)), const SizedBox(width: 7), Text(audLabel(f, filter: true), style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600)), const SizedBox(width: 2), Icon(Icons.keyboard_arrow_down_rounded, size: 18, color: sub(context))]),
              ));
            }),
          ]))),
        ]),
        SideMenu(open: menu, close: () => setState(() => menu = false)),
      ]),
    ));
  }
}

class TapButton extends StatefulWidget {
  final VoidCallback onTap;
  const TapButton({super.key, required this.onTap});
  @override
  State<TapButton> createState() => _TapButtonState();
}

class _TapButtonState extends State<TapButton> with TickerProviderStateMixin {
  late final idle = AnimationController(vsync: this, duration: const Duration(seconds: 5))..repeat();
  late final burst = AnimationController(vsync: this, duration: const Duration(milliseconds: 1000));
  bool down = false;
  @override
  void dispose() { idle.dispose(); burst.dispose(); super.dispose(); }
  @override
  Widget build(BuildContext context) {
    final ring = ink(context);
    return SizedBox(width: 330, height: 330, child: Stack(alignment: Alignment.center, children: [
      AnimatedBuilder(animation: Listenable.merge([idle, burst]), builder: (_, __) => CustomPaint(size: const Size(330, 330), painter: _Rings(idle.value, burst.value, ring))),
      GestureDetector(
        onTapDown: (_) => setState(() => down = true),
        onTapCancel: () => setState(() => down = false),
        onTapUp: (_) => setState(() => down = false),
        onTap: () { HapticFeedback.mediumImpact(); burst.forward(from: 0); widget.onTap(); },
        child: AnimatedScale(
          scale: down ? .94 : 1, duration: const Duration(milliseconds: 150), curve: Curves.easeOut,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 150), width: 204, height: 204,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: const RadialGradient(center: Alignment(-.36, -.52), radius: 1.1, colors: [Color(0xFF3C7357), Color(0xFF235A3E), green, Color(0xFF0F2E1F)], stops: [0, .38, .75, 1]),
              boxShadow: [BoxShadow(color: green.withValues(alpha: down ? .2 : .36), blurRadius: down ? 24 : 52, offset: Offset(0, down ? 10 : 26))],
            ),
            child: const Center(child: Logo(96, cream)),
          ),
        ),
      ),
    ]));
  }
}

class _Rings extends CustomPainter {
  final double t, b;
  final Color c;
  _Rings(this.t, this.b, this.c);
  @override
  void paint(Canvas canvas, Size size) {
    final o = size.center(Offset.zero);
    for (var i = 0; i < 3; i++) {
      final k = (t + i / 3) % 1;
      canvas.drawCircle(o, 106 + k * 56, Paint()..style = PaintingStyle.stroke..strokeWidth = 1.2..color = c.withValues(alpha: (1 - k) * .16));
    }
    if (b > 0 && b < 1) {
      final e = Curves.easeOutCubic.transform(b);
      canvas.drawCircle(o, 102 + e * 62, Paint()..style = PaintingStyle.stroke..strokeWidth = 2.4..color = c.withValues(alpha: (1 - b) * .4));
    }
  }
  @override
  bool shouldRepaint(_Rings o) => true;
}

class SideMenu extends StatelessWidget {
  final bool open;
  final VoidCallback close;
  const SideMenu({super.key, required this.open, required this.close});
  @override
  Widget build(BuildContext context) {
    final s = Store.i;
    Widget item(IconData i, String k, Widget Function() p) => Tap(onTap: () { close(); go(context, p()); }, child: Padding(padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 8), child: Row(children: [Icon(i, size: 24, color: ink(context)), const SizedBox(width: 16), Text(s.t(k), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600))])));
    return Stack(children: [
      IgnorePointer(ignoring: !open, child: GestureDetector(onTap: close, child: AnimatedOpacity(opacity: open ? 1 : 0, duration: const Duration(milliseconds: 300), child: Container(color: Colors.black45)))),
      AnimatedPositioned(
        duration: const Duration(milliseconds: 380), curve: Curves.easeOutCubic, left: open ? 0 : -320, top: 0, bottom: 0, width: 300,
        child: Container(
          decoration: BoxDecoration(color: bgOf(context), borderRadius: const BorderRadius.horizontal(right: Radius.circular(36)), boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: .2), blurRadius: 40)]),
          child: SafeArea(child: ListenableBuilder(listenable: s, builder: (_, __) => Padding(padding: const EdgeInsets.fromLTRB(20, 18, 20, 18), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Brand(),
            const SizedBox(height: 28),
            item(Icons.tune_rounded, 'settings', () => const SettingsPage()),
            item(Icons.download_done_rounded, 'offline_t', () => const OfflinePage()),
            item(Icons.info_outline_rounded, 'about', () => TextPage(s.t('about'), s.t('about_t'))),
            item(Icons.rule_rounded, 'policy', () => TextPage(s.t('policy'), s.t('policy_t'))),
            item(Icons.lock_outline_rounded, 'privacy', () => TextPage(s.t('privacy'), s.t('privacy_t'))),
            if (!kIsWeb) Tap(onTap: () { close(); launchUrl(Uri.parse('https://hulhup.my.id'), mode: LaunchMode.externalApplication); }, child: Padding(padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 8), child: Row(children: [Icon(Icons.language_rounded, size: 24, color: ink(context)), const SizedBox(width: 16), Text(s.t('website'), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600))]))),
            if (!kIsWeb) Tap(onTap: () { close(); () async { final up = await s.checkUpdate(force: true); if (up) { showUpdate(context); } else { toast(s.t('upd_none')); } }(); }, child: Padding(padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 8), child: Row(children: [Icon(Icons.system_update_rounded, size: 24, color: ink(context)), const SizedBox(width: 16), Text(s.t('upd_menu'), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600))]))),
            if (kIsWeb) Tap(onTap: () { close(); showGetApp(context); }, child: Padding(padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 8), child: Row(children: [Icon(Icons.android_rounded, size: 24, color: ink(context)), const SizedBox(width: 16), Text(s.t('get_app'), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600))]))),
            const Spacer(),
            if (s.me == null) PBtn(s.t('login'), () { close(); go(context, const AuthPage()); }, icon: Icons.login_rounded)
            else PBtn(s.t('logout'), () async { close(); await s.logout(); }, icon: Icons.logout_rounded, ghost: true, fgc: heart),
            const SizedBox(height: 14),
            Center(child: Text(kBuild > 0 ? 'Misyi · v1.2.0 ($kBuild)' : 'Misyi · v1.2.0', style: TextStyle(color: sub(context), fontWeight: FontWeight.w700, letterSpacing: 1.2, fontSize: 12))),
          ])))),
        ),
      ),
    ]);
  }
}

class PopupBody extends StatelessWidget {
  final A a;
  const PopupBody(this.a, {super.key});
  @override
  Widget build(BuildContext context) {
    final s = Store.i;
    return Column(mainAxisSize: MainAxisSize.min, children: [
      if (a.pprof) Tap(onTap: () { Navigator.pop(context); go(context, ProfilePage(a.owner)); }, child: Row(children: [
        Avatar(a.ownerAvatar, a.ownerName, 46),
        const SizedBox(width: 12),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Row(children: [Flexible(child: Text(a.ownerName, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16))), if (a.ownerVerified) const Padding(padding: EdgeInsets.only(left: 4), child: Icon(Icons.verified_rounded, size: 16, color: Color(0xFF2F8F5B)))]), Text(a.created > 0 ? '${a.owner} · ${s.when(a.created)}' : a.owner, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: sub(context), fontSize: 13))])),
        Icon(Icons.chevron_right_rounded, color: sub(context)),
      ])),
      if (!a.pprof && a.created > 0) Align(alignment: Alignment.centerLeft, child: Padding(padding: const EdgeInsets.only(bottom: 6), child: Text(s.when(a.created), style: TextStyle(color: sub(context), fontSize: 13)))),
      if (a.desc.trim().isNotEmpty) Padding(padding: EdgeInsets.only(top: a.pprof ? 12 : 0), child: Align(alignment: Alignment.centerLeft, child: Text(a.desc.trim(), style: const TextStyle(fontSize: 15, height: 1.4)))),
      SizedBox(height: a.pprof || a.desc.trim().isNotEmpty ? 14 : 4),
      Container(
        padding: const EdgeInsets.fromLTRB(8, 8, 6, 8), decoration: BoxDecoration(color: soft(context), borderRadius: BorderRadius.circular(26)),
        child: ListenableBuilder(listenable: s, builder: (_, __) {
          final on = s.playing == a.id;
          return Row(children: [
            Tap(onTap: () => s.play(a).catchError((_) => toast(s.t('e_server'), bad: true)), child: AnimatedContainer(duration: const Duration(milliseconds: 250), width: 44, height: 44, decoration: BoxDecoration(color: on ? ink(context) : green, shape: BoxShape.circle), child: AnimatedSwitcher(duration: const Duration(milliseconds: 200), child: Icon(on ? Icons.pause_rounded : Icons.play_arrow_rounded, key: ValueKey(on), color: on ? bgOf(context) : cream, size: 26)))),
            Expanded(child: ValueListenableBuilder<int>(valueListenable: s.pos, builder: (_, ms, __) {
              final total = (s.dur > 0 ? s.dur : a.secs * 1000).clamp(1, 1 << 30);
              return Padding(padding: const EdgeInsets.symmetric(horizontal: 12), child: ClipRRect(borderRadius: BorderRadius.circular(4), child: LinearProgressIndicator(value: (ms / total).clamp(0.0, 1.0), minHeight: 6, backgroundColor: ink(context).withValues(alpha: .12), color: ink(context))));
            })),
            ValueListenableBuilder<int>(valueListenable: s.pos, builder: (_, ms, __) => Text('${mmss(ms ~/ 1000)} / ${mmss(a.secs)}', style: TextStyle(color: on ? ink(context) : sub(context), fontSize: 13, fontWeight: FontWeight.w700))),
            LikeBtn(a.liked, a.likes, () => likeAudio(a)),
          ]);
        }),
      ),
      const SizedBox(height: 10),
      const SpeedRow(),
      const SizedBox(height: 10),
      ListenableBuilder(listenable: s, builder: (_, __) {
        final off = s.isOffline(a.id);
        return PBtn(off ? s.t('is_offline') : s.t('mk_offline'), () => toggleOffline(a), ghost: true, icon: off ? Icons.offline_pin_rounded : Icons.download_for_offline_outlined);
      }),
      if (s.me != null && s.me!.username != a.owner) Tap(onTap: () => reportSheet(context, audio: a.id), child: Padding(padding: const EdgeInsets.only(top: 12, bottom: 2), child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [Icon(Icons.flag_outlined, size: 16, color: sub(context)), const SizedBox(width: 6), Text(s.t('report'), style: TextStyle(color: sub(context), fontSize: 13, fontWeight: FontWeight.w600))]))),
    ]);
  }
}


/// Pemilih kecepatan putar buatan sendiri (bukan bawaan hp/browser).
class SpeedRow extends StatelessWidget {
  const SpeedRow({super.key});
  static const rates = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
  String _l(double r) => r == r.roundToDouble() ? '${r.toInt()}×' : '${r.toString().replaceAll(RegExp(r'0+$'), '')}×';
  @override
  Widget build(BuildContext context) {
    final s = Store.i;
    return ListenableBuilder(listenable: s, builder: (_, __) => Row(children: [
      Icon(Icons.speed_rounded, size: 18, color: sub(context)),
      const SizedBox(width: 8),
      Expanded(child: Container(
        padding: const EdgeInsets.all(3), decoration: BoxDecoration(color: soft(context), borderRadius: BorderRadius.circular(18)),
        child: Row(children: [for (final r in rates) Expanded(child: Tap(onTap: () => s.setRate(r), scale: .94, child: AnimatedContainer(
          duration: const Duration(milliseconds: 200), height: 32, alignment: Alignment.center,
          decoration: BoxDecoration(color: s.rate == r ? ink(context) : Colors.transparent, borderRadius: BorderRadius.circular(15)),
          child: Text(_l(r), style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: s.rate == r ? bgOf(context) : sub(context))),
        )))]),
      )),
    ]));
  }
}

/// Pembaruan di dalam aplikasi: unduh dengan tampilan sendiri, lalu buka pemasang Android.
Future<void> showUpdate(BuildContext context) => sheet(context, (_) => const _UpdateBody());

class _UpdateBody extends StatefulWidget {
  const _UpdateBody();
  @override
  State<_UpdateBody> createState() => _UpdateBodyState();
}

class _UpdateBodyState extends State<_UpdateBody> {
  String step = 'idle'; // idle | down | inst | fail
  double pct = 0;

  void _go() {
    setState(() { step = 'down'; pct = 0; });
    try {
      OtaUpdate().execute(kApkUrl, destinationFilename: 'hulhup.apk').listen((e) {
        if (!mounted) return;
        setState(() {
          switch (e.status) {
            case OtaStatus.DOWNLOADING: step = 'down'; pct = ((double.tryParse(e.value ?? '') ?? 0) / 100).clamp(0.0, 1.0); break;
            case OtaStatus.INSTALLING: step = 'inst'; pct = 1; break;
            case OtaStatus.INSTALLATION_DONE: break;
            default: step = 'fail';
          }
        });
      }, onError: (_) { if (mounted) setState(() => step = 'fail'); });
    } catch (_) { setState(() => step = 'fail'); }
  }

  @override
  Widget build(BuildContext context) {
    final s = Store.i;
    final busy = step == 'down' || step == 'inst';
    return Column(mainAxisSize: MainAxisSize.min, children: [
      Icon(Icons.system_update_rounded, size: 40, color: ink(context)),
      const SizedBox(height: 12),
      Text(s.t('upd_title'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 20)),
      const SizedBox(height: 8),
      Text(step == 'fail' ? s.t('upd_fail') : step == 'down' ? s.t('upd_down') : step == 'inst' ? s.t('upd_inst') : s.t('upd_note'), textAlign: TextAlign.center, style: TextStyle(color: sub(context), fontSize: 14, height: 1.4)),
      if (busy) ...[
        const SizedBox(height: 18),
        ClipRRect(borderRadius: BorderRadius.circular(5), child: LinearProgressIndicator(value: step == 'inst' ? 1 : (pct > 0 ? pct : null), minHeight: 8, backgroundColor: ink(context).withValues(alpha: .12), color: ink(context))),
        const SizedBox(height: 8),
        Text(step == 'down' && pct > 0 ? '${(pct * 100).round()}%' : '', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
      ],
      const SizedBox(height: 18),
      if (!busy) PBtn(step == 'fail' ? s.t('retry') : s.t('upd_now'), _go, icon: Icons.download_rounded),
      if (step == 'fail') ...[const SizedBox(height: 10), PBtn(s.t('upd_browser'), () => launchUrl(Uri.parse(kApkUrl), mode: LaunchMode.externalApplication), ghost: true, icon: Icons.open_in_browser_rounded)],
    ]);
  }
}




/// Halaman unduh aplikasi Android di web, dengan tampilan sendiri.
Future<void> showGetApp(BuildContext context) => sheet(context, (_) => const _GetAppBody());

class _GetAppBody extends StatefulWidget {
  const _GetAppBody();
  @override
  State<_GetAppBody> createState() => _GetAppState();
}

class _GetAppState extends State<_GetAppBody> {
  String ver = '', size = '';
  @override
  void initState() { super.initState(); _info(); }
  Future<void> _info() async {
    try {
      final r = await http.get(Uri.parse('https://hulhup.my.id/version.json')).timeout(const Duration(seconds: 8));
      ver = '${(jsonDecode(r.body) as Map)['version'] ?? ''}';
      final h = await http.head(Uri.parse(kApkUrl)).timeout(const Duration(seconds: 8));
      final n = int.tryParse(h.headers['content-length'] ?? '');
      if (n != null) size = '${(n / 1048576).round()} MB';
    } catch (_) {}
    if (mounted) setState(() {});
  }

  Widget _step(int n, String t) => Padding(padding: const EdgeInsets.only(bottom: 10), child: Row(children: [
        Container(width: 26, height: 26, alignment: Alignment.center, decoration: BoxDecoration(color: soft(context), shape: BoxShape.circle), child: Text('$n', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13))),
        const SizedBox(width: 12),
        Expanded(child: Text(t, style: const TextStyle(fontSize: 14.5, height: 1.35))),
      ]));

  @override
  Widget build(BuildContext context) {
    final s = Store.i;
    return Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
      Center(child: Icon(Icons.android_rounded, size: 44, color: ink(context))),
      const SizedBox(height: 10),
      Center(child: Text(s.t('ga_title'), textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 20))),
      const SizedBox(height: 8),
      Text(s.t('ga_note'), textAlign: TextAlign.center, style: TextStyle(color: sub(context), fontSize: 14, height: 1.4)),
      if (ver.isNotEmpty || size.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 12), child: Center(child: Text([if (ver.isNotEmpty) '${s.t('ga_ver')} $ver', if (size.isNotEmpty) '${s.t('ga_size')} $size'].join(' · '), style: TextStyle(color: sub(context), fontWeight: FontWeight.w700, fontSize: 13)))),
      const SizedBox(height: 18),
      _step(1, s.t('ga_s1')), _step(2, s.t('ga_s2')), _step(3, s.t('ga_s3')),
      const SizedBox(height: 8),
      PBtn(s.t('ga_btn'), () => launchUrl(Uri.parse(kApkUrl), mode: LaunchMode.externalApplication), icon: Icons.download_rounded),
    ]);
  }
}
