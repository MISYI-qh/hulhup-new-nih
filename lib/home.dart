import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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
      if (a == null) { toast(s.t(s.fromOffline ? 'no_net_empty' : 'nobody')); return; }
      if (s.fromOffline) toast(s.t('no_net'));
      s.play(a, force: true).catchError((_) => toast(s.t('e_server'), bad: true));
      sheet(context, (_) => PopupBody(a)).then((_) { if (s.playing == a.id) s.stop(); });
    } catch (e) {
      toast(s.err(e), bad: true);
    } finally {
      _busy = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = Store.i;
    return Scaffold(
      body: Stack(children: [
        Column(children: [
          TopBar(
            lead: IconBtn(Icons.menu_rounded, () => setState(() => menu = true)),
            center: const Brand(),
            actions: [IconBtn(Icons.search_rounded, () => go(context, const SearchPage())), ListenableBuilder(listenable: s, builder: (_, __) => IconBtn(Icons.person_outline_rounded, () => go(context, ProfilePage(s.me?.username)), dot: s.unread > 0))],
          ),
          Expanded(child: Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
            TapButton(onTap: _tap),
            const SizedBox(height: 20),
            ListenableBuilder(listenable: s, builder: (_, __) => AnimatedSwitcher(
              duration: const Duration(milliseconds: 300),
              transitionBuilder: (w, a) => FadeTransition(opacity: a, child: SlideTransition(position: Tween(begin: const Offset(0, .3), end: Offset.zero).animate(a), child: w)),
              child: Text(fmt(s.taps), key: ValueKey(s.taps), style: TextStyle(fontSize: 38, fontWeight: FontWeight.w800, letterSpacing: -1.2, color: ink(context))),
            )),
          ]))),
        ]),
        SideMenu(open: menu, close: () => setState(() => menu = false)),
      ]),
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
            const Spacer(),
            if (s.me == null) PBtn(s.t('login'), () { close(); go(context, const AuthPage()); }, icon: Icons.login_rounded)
            else PBtn(s.t('logout'), () async { close(); await s.logout(); }, icon: Icons.logout_rounded, ghost: true, fgc: heart),
            const SizedBox(height: 14),
            Center(child: Text('Misyi', style: TextStyle(color: sub(context), fontWeight: FontWeight.w700, letterSpacing: 1.2, fontSize: 12))),
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
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(a.ownerName, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)), Text(a.owner, style: TextStyle(color: sub(context), fontSize: 13))])),
        Icon(Icons.chevron_right_rounded, color: sub(context)),
      ])),
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
      ListenableBuilder(listenable: s, builder: (_, __) {
        final off = s.isOffline(a.id);
        return PBtn(off ? s.t('is_offline') : s.t('mk_offline'), () => toggleOffline(a), ghost: true, icon: off ? Icons.offline_pin_rounded : Icons.download_for_offline_outlined);
      }),
    ]);
  }
}
