import 'dart:async';
import 'dart:math';
import 'package:flutter/material.dart';
import 'routes.dart';
import 'package:flutter/services.dart';
import 'core.dart';

const brand = Color(0xFF5B47F5); // ungu-biru merek: warna tunggal logo dan aksen kecil: aksen kecil saja, tampilan tetap dominan hitam-putih
const blue = Color(0xFF3897F0); // tautan, tag, tanda verifikasi
const cream = Color(0xFFFBF6E9);
const heart = Color(0xFFE0524A);
final navKey = GlobalKey<NavigatorState>();

bool isDark(BuildContext c) => Theme.of(c).brightness == Brightness.dark;
Color ink(BuildContext c) => Theme.of(c).colorScheme.primary;
Color sub(BuildContext c) => ink(c).withValues(alpha: .6);
Color soft(BuildContext c) => isDark(c) ? const Color(0xFF1A1A1A) : const Color(0xFFF4F4F4);
Color card(BuildContext c) => isDark(c) ? const Color(0xFF141414) : Colors.white;
/// Latar tombol bulat/ikon: hitam (terang) atau abu gelap (gelap). Koral hanya untuk aksen kecil.
Color btnBg(BuildContext c) => isDark(c) ? const Color(0xFF2E2E2E) : const Color(0xFF111111);
Color bgOf(BuildContext c) => Theme.of(c).scaffoldBackgroundColor;

Route<T> route<T>(Widget p, {String? name}) => PageRouteBuilder<T>(
      settings: RouteSettings(name: name ?? pathOf(p)),
      transitionDuration: const Duration(milliseconds: 420),
      reverseTransitionDuration: const Duration(milliseconds: 300),
      pageBuilder: (_, __, ___) => p,
      transitionsBuilder: (_, a, __, child) {
        final cu = CurvedAnimation(parent: a, curve: Curves.easeOutCubic, reverseCurve: Curves.easeInCubic);
        return FadeTransition(opacity: cu, child: SlideTransition(position: Tween(begin: const Offset(0, .05), end: Offset.zero).animate(cu), child: child));
      },
    );
Future<T?> go<T>(BuildContext c, Widget p) => Navigator.of(c).push<T>(route<T>(p));

class Tap extends StatefulWidget {
  final Widget child;
  final VoidCallback? onTap;
  final double scale;
  const Tap({super.key, required this.child, this.onTap, this.scale = .94});
  @override
  State<Tap> createState() => _TapState();
}

class _TapState extends State<Tap> {
  bool d = false;
  @override
  Widget build(BuildContext context) => GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTapDown: widget.onTap == null ? null : (_) => setState(() => d = true),
        onTapUp: (_) => setState(() => d = false),
        onTapCancel: () => setState(() => d = false),
        onTap: widget.onTap == null ? null : () { HapticFeedback.selectionClick(); widget.onTap!(); },
        child: AnimatedScale(scale: d ? widget.scale : 1, duration: const Duration(milliseconds: 130), curve: Curves.easeOut, child: AnimatedOpacity(opacity: d ? .85 : 1, duration: const Duration(milliseconds: 130), child: widget.child)),
      );
}

class IconBtn extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;
  final bool dot;
  final Color? color;
  const IconBtn(this.icon, this.onTap, {super.key, this.dot = false, this.color});
  @override
  Widget build(BuildContext context) => Tap(
        onTap: onTap,
        child: SizedBox(width: 48, height: 48, child: Stack(alignment: Alignment.center, children: [
          Icon(icon, size: 24, color: color ?? ink(context)),
          if (dot) Positioned(top: 11, right: 11, child: Container(width: 9, height: 9, decoration: BoxDecoration(color: heart, shape: BoxShape.circle, border: Border.all(color: bgOf(context), width: 1.5)))),
        ])),
      );
}

class PBtn extends StatelessWidget {
  final String label;
  final IconData? icon;
  final VoidCallback? onTap;
  final bool loading, ghost;
  final Color? color, fgc;
  const PBtn(this.label, this.onTap, {super.key, this.icon, this.loading = false, this.ghost = false, this.color, this.fgc});
  @override
  Widget build(BuildContext context) {
    final fg = fgc ?? (ghost ? ink(context) : (color == null && isDark(context) ? const Color(0xFF111111) : Colors.white));
    final bg = ghost ? soft(context) : (color ?? ink(context));
    return Tap(
      onTap: loading ? null : onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 220), height: 52,
        decoration: BoxDecoration(color: onTap == null && !loading ? bg.withValues(alpha: .4) : bg, borderRadius: BorderRadius.circular(26)),
        alignment: Alignment.center,
        child: AnimatedSwitcher(
          duration: const Duration(milliseconds: 200),
          child: loading
              ? SizedBox(key: const ValueKey('l'), width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4, strokeCap: StrokeCap.round, color: fg))
              : Row(key: const ValueKey('t'), mainAxisSize: MainAxisSize.min, children: [
                  if (icon != null) ...[Padding(padding: const EdgeInsets.only(left: 14), child: Icon(icon, size: 20, color: fg)), const SizedBox(width: 0)],
                  Flexible(child: Padding(padding: const EdgeInsets.symmetric(horizontal: 14), child: FittedBox(fit: BoxFit.scaleDown, child: Text(label, maxLines: 1, style: TextStyle(color: fg, fontWeight: FontWeight.w700, fontSize: 15))))),
                ]),
        ),
      ),
    );
  }
}

class Field extends StatefulWidget {
  final String label;
  final TextEditingController c;
  final bool secret;
  final int? max;
  final int lines;
  final TextInputType? kb;
  final ValueChanged<String>? onChanged;
  const Field(this.label, this.c, {super.key, this.secret = false, this.max, this.lines = 1, this.kb, this.onChanged});
  @override
  State<Field> createState() => _FieldState();
}

class _FieldState extends State<Field> {
  bool hide = true;
  final f = FocusNode();
  @override
  void initState() { super.initState(); f.addListener(() => setState(() {})); }
  @override
  void dispose() { f.dispose(); super.dispose(); }
  @override
  Widget build(BuildContext context) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Padding(padding: const EdgeInsets.only(left: 6, bottom: 6), child: Text(widget.label, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: sub(context)))),
        AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          padding: const EdgeInsets.only(left: 18, right: 6),
          decoration: BoxDecoration(color: soft(context), borderRadius: BorderRadius.circular(widget.lines > 1 ? 24 : 28), border: Border.all(color: f.hasFocus ? ink(context) : Colors.transparent, width: 1.5)),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(child: TextField(
              controller: widget.c, focusNode: f, obscureText: widget.secret && hide, minLines: widget.lines, maxLines: widget.secret ? 1 : widget.lines,
              maxLength: widget.max, keyboardType: widget.kb, onChanged: widget.onChanged, cursorColor: ink(context), cursorRadius: const Radius.circular(2),
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w500),
              decoration: const InputDecoration(border: InputBorder.none, counterText: '', isDense: true, contentPadding: EdgeInsets.symmetric(vertical: 16)),
            )),
            if (widget.secret) IconBtn(hide ? Icons.visibility_off_rounded : Icons.visibility_rounded, () => setState(() => hide = !hide)),
          ]),
        ),
        if (widget.max != null) Padding(padding: const EdgeInsets.only(right: 8, top: 4), child: Align(alignment: Alignment.centerRight, child: ListenableBuilder(listenable: widget.c, builder: (_, __) => Text('${widget.c.text.length}/${widget.max}', style: TextStyle(fontSize: 12, color: sub(context)))))),
      ]);
}

class Toggle extends StatelessWidget {
  final bool v;
  final ValueChanged<bool> on;
  const Toggle(this.v, this.on, {super.key});
  @override
  Widget build(BuildContext context) => Tap(
        onTap: () => on(!v),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 260), curve: Curves.easeOutCubic, width: 54, height: 32, padding: const EdgeInsets.all(3),
          decoration: BoxDecoration(color: v ? ink(context) : ink(context).withValues(alpha: .18), borderRadius: BorderRadius.circular(16)),
          child: AnimatedAlign(duration: const Duration(milliseconds: 260), curve: Curves.easeOutBack, alignment: v ? Alignment.centerRight : Alignment.centerLeft, child: Container(width: 26, height: 26, decoration: BoxDecoration(color: bgOf(context), shape: BoxShape.circle))),
        ),
      );
}

class Seg<T> extends StatelessWidget {
  final List<(T, String)> items;
  final T value;
  final ValueChanged<T> on;
  const Seg(this.items, this.value, this.on, {super.key});
  @override
  Widget build(BuildContext context) {
    final n = items.length, i = max(0, items.indexWhere0(value));
    return Container(
      height: 48, padding: const EdgeInsets.all(4), decoration: BoxDecoration(color: soft(context), borderRadius: BorderRadius.circular(24)),
      child: Stack(children: [
        AnimatedAlign(duration: const Duration(milliseconds: 280), curve: Curves.easeOutCubic, alignment: Alignment(n == 1 ? 0 : -1 + 2 * i / (n - 1), 0), child: FractionallySizedBox(widthFactor: 1 / n, heightFactor: 1, child: Container(decoration: BoxDecoration(color: ink(context), borderRadius: BorderRadius.circular(20))))),
        Row(children: [for (final e in items) Expanded(child: Tap(onTap: () => on(e.$1), scale: .97, child: Center(child: AnimatedDefaultTextStyle(duration: const Duration(milliseconds: 200), style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: e.$1 == value ? bgOf(context) : sub(context)), child: Text(e.$2)))))]),
      ]),
    );
  }
}

extension _Idx<T> on List<(T, String)> {
  int indexWhere0(T v) => indexWhere((e) => e.$1 == v);
}

Future<T?> sheet<T>(BuildContext c, Widget Function(BuildContext) b) => showModalBottomSheet<T>(
      context: c, isScrollControlled: true, backgroundColor: Colors.transparent, barrierColor: Colors.black38,
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
        child: Container(
          margin: const EdgeInsets.all(12), padding: const EdgeInsets.fromLTRB(20, 10, 20, 22),
          decoration: BoxDecoration(color: card(ctx), borderRadius: BorderRadius.circular(32), boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: .18), blurRadius: 40)]),
          child: SafeArea(top: false, child: Column(mainAxisSize: MainAxisSize.min, children: [
            Container(width: 38, height: 4, margin: const EdgeInsets.only(bottom: 16), decoration: BoxDecoration(color: ink(ctx).withValues(alpha: .18), borderRadius: BorderRadius.circular(2))),
            b(ctx),
          ])),
        ),
      ),
    );

Future<bool> confirm(BuildContext c, String title, String body, String yes, {bool danger = false}) async =>
    await showGeneralDialog<bool>(
      context: c, barrierDismissible: true, barrierLabel: 'x', barrierColor: Colors.black45, transitionDuration: const Duration(milliseconds: 280),
      pageBuilder: (ctx, _, __) => Center(
        child: Material(
          color: Colors.transparent,
          child: Container(
            margin: const EdgeInsets.symmetric(horizontal: 28), padding: const EdgeInsets.all(24), constraints: const BoxConstraints(maxWidth: 380),
            decoration: BoxDecoration(color: card(ctx), borderRadius: BorderRadius.circular(32)),
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
              const SizedBox(height: 10),
              Text(body, style: TextStyle(fontSize: 15, height: 1.5, color: sub(ctx))),
              const SizedBox(height: 22),
              Row(children: [
                Expanded(child: PBtn(Store.i.t('cancel'), () => Navigator.pop(ctx, false), ghost: true)),
                const SizedBox(width: 10),
                Expanded(child: PBtn(yes, () => Navigator.pop(ctx, true), color: danger ? heart : null)),
              ]),
            ]),
          ),
        ),
      ),
      transitionBuilder: (ctx, a, _, child) => FadeTransition(opacity: a, child: ScaleTransition(scale: Tween(begin: .92, end: 1.0).animate(CurvedAnimation(parent: a, curve: Curves.easeOutBack)), child: child)),
    ) ??
    false;

void toast(String m, {bool bad = false}) {
  final o = navKey.currentState?.overlay;
  if (o == null) return;
  late OverlayEntry e;
  e = OverlayEntry(builder: (_) => _Toast(m, bad, () => e.remove()));
  o.insert(e);
}

class _Toast extends StatefulWidget {
  final String m;
  final bool bad;
  final VoidCallback done;
  const _Toast(this.m, this.bad, this.done);
  @override
  State<_Toast> createState() => _ToastState();
}

class _ToastState extends State<_Toast> with SingleTickerProviderStateMixin {
  late final c = AnimationController(vsync: this, duration: const Duration(milliseconds: 380))..forward();
  @override
  void initState() {
    super.initState();
    Timer(const Duration(milliseconds: 2600), () async { if (mounted) { await c.reverse(); widget.done(); } });
  }
  @override
  void dispose() { c.dispose(); super.dispose(); }
  @override
  Widget build(BuildContext context) {
    final cu = CurvedAnimation(parent: c, curve: Curves.easeOutBack, reverseCurve: Curves.easeIn);
    return Positioned(
      top: MediaQuery.of(context).padding.top + 14, left: 20, right: 20,
      child: IgnorePointer(child: FadeTransition(opacity: c, child: SlideTransition(position: Tween(begin: const Offset(0, -1), end: Offset.zero).animate(cu), child: Center(child: Material(
        color: Colors.transparent,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 13),
          decoration: BoxDecoration(color: widget.bad ? const Color(0xFF7A2A25) : const Color(0xFF1F1F1F), borderRadius: BorderRadius.circular(26), boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: .2), blurRadius: 24, offset: const Offset(0, 8))]),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Icon(widget.bad ? Icons.error_outline_rounded : Icons.check_circle_outline_rounded, color: cream, size: 20),
            const SizedBox(width: 10),
            Flexible(child: Text(widget.m, style: const TextStyle(color: cream, fontWeight: FontWeight.w600, fontSize: 14))),
          ]),
        ),
      ))))),
    );
  }
}

const brandDeep = Color(0xFF4330D0);

/// Dua mata yang mengintip dari balik dinding. [w] = lebar tanda. rise 0..1 (0 = bersembunyi), look -1..1 arah pandang, blink 0..1.
class _PeekPainter extends CustomPainter {
  final Color eye, pupil, wall;
  final double rise, look, blink, lookY, cross, winkL, winkR, sep, eyeSc, pupSc, wallDy, wallSx;
  _PeekPainter(this.eye, this.pupil, this.wall, {this.rise = 1, this.look = .3, this.blink = 0, this.lookY = 0, this.cross = 0, this.winkL = 0, this.winkR = 0, this.sep = 0, this.eyeSc = 1, this.pupSc = 1, this.wallDy = 0, this.wallSx = 1});
  @override
  void paint(Canvas c, Size s) {
    final u = s.width / .72, cx = s.width / 2, cy = s.height / 2;
    Offset o(double x, double y) => Offset(cx + x * u, cy + y * u);
    final ep = Paint()..color = eye..isAntiAlias = true, pp = Paint()..color = pupil..isAntiAlias = true;
    final lift = (1 - rise) * .30;
    c.save();
    c.clipRect(Rect.fromLTRB(-1e5, -1e5, 1e5, o(0, .21 + wallDy).dy)); // mata yang turun tersembunyi di balik dinding, tidak muncul di bawahnya
    for (final k in [-1, 1]) {
      final bl = (blink + (k < 0 ? winkL : winkR)).clamp(0.0, 1.0);
      final ec = o(k * (.15 + sep), -.06 + lift);
      c.drawOval(Rect.fromCenter(center: ec, width: .25 * u * eyeSc, height: .30 * u * eyeSc * (1 - .92 * bl)), ep);
      final pr = .055 * u * pupSc, lx = look + (k < 0 ? cross : -cross);
      c.drawOval(Rect.fromCenter(center: ec + Offset((.022 + lx * .03) * u, (-.035 * (1 - bl) + lookY * .03) * u), width: pr * 2, height: pr * 2 * (1 - .9 * bl)), pp);
    }
    c.restore();
    c.drawRRect(RRect.fromRectAndRadius(Rect.fromLTRB(o(-.36 * wallSx, 0).dx, o(0, wallDy).dy, o(.36 * wallSx, 0).dx, o(0, .21 + wallDy).dy), Radius.circular(.07 * u)), Paint()..color = wall..isAntiAlias = true);
  }
  @override
  bool shouldRepaint(_PeekPainter o) => o.rise != rise || o.look != look || o.blink != blink || o.lookY != lookY || o.cross != cross || o.winkL != winkL || o.winkR != winkR || o.sep != sep || o.eyeSc != eyeSc || o.pupSc != pupSc || o.wallDy != wallDy || o.wallSx != wallSx || o.eye != eye || o.pupil != pupil || o.wall != wall;
}

/// Warna tanda tanpa bingkai: terang = mata ungu, pupil putih, dinding ungu tua; gelap = mata putih, pupil ungu, dinding ungu.
List<Color> markColors(BuildContext c) => Theme.of(c).brightness == Brightness.dark ? [Colors.white, brand, brand] : [brand, Colors.white, brandDeep];

/// Logo Hulhup (tanda saja, tanpa ubin). Tampil di atas latar ungu: mata putih, dinding ungu tua.
class Logo extends StatelessWidget {
  final double width;
  const Logo(this.width, {super.key});
  @override
  Widget build(BuildContext context) => SizedBox(width: width, height: width * .5 / .72, child: CustomPaint(painter: _PeekPainter(Colors.white, brand, brandDeep)));
}

/// Tanda logo tanpa bingkai, warna mengikuti tema.
class LogoMark extends StatelessWidget {
  final double width;
  const LogoMark(this.width, {super.key});
  @override
  Widget build(BuildContext context) {
    final m = markColors(context);
    return SizedBox(width: width, height: width * .5 / .72, child: CustomPaint(painter: _PeekPainter(m[0], m[1], m[2])));
  }
}

/// Ubin logo (seperti ikon aplikasi): ungu, sudut membulat, tanda di tengah.
class LogoTile extends StatelessWidget {
  final double size;
  const LogoTile(this.size, {super.key});
  @override
  Widget build(BuildContext context) => Container(width: size, height: size, decoration: BoxDecoration(color: brand, borderRadius: BorderRadius.circular(size * .225)), alignment: Alignment.center, child: Logo(size * .6));
}

/// Loading: ubin logo, mata naik mengintip, menengok kiri-kanan, berkedip, lalu turun lagi. Dipakai untuk semua loading.
class LogoLoop extends StatelessWidget {
  final double size;
  const LogoLoop({super.key, this.size = 44});
  @override
  Widget build(BuildContext context) => RepaintBoundary(child: AnimMark(size, auto: true, loop: true, first: 0, ms: 1500));
}

/// Tarik-untuk-muat dengan logo Hulhup: titik naik mengikuti tarikan, memantul saat memuat.
class LogoRefresh extends StatefulWidget {
  final Future<void> Function() onRefresh;
  final Widget child;
  const LogoRefresh({super.key, required this.onRefresh, required this.child});
  @override
  State<LogoRefresh> createState() => _LogoRefreshState();
}

class _LogoRefreshState extends State<LogoRefresh> {
  RefreshIndicatorStatus? st;
  @override
  Widget build(BuildContext context) {
    final show = st == RefreshIndicatorStatus.armed || st == RefreshIndicatorStatus.snap || st == RefreshIndicatorStatus.refresh;
    return Stack(children: [
      Positioned(top: 10, left: 0, right: 0, child: IgnorePointer(child: AnimatedOpacity(
        opacity: st == null || st == RefreshIndicatorStatus.done || st == RefreshIndicatorStatus.canceled ? 0 : 1, duration: const Duration(milliseconds: 180),
        child: AnimatedScale(scale: show ? 1 : .6, duration: const Duration(milliseconds: 220), curve: Curves.easeOutBack, child: const Center(child: LogoLoop(size: 34)))))),
      RefreshIndicator.noSpinner(onStatusChange: (v) { if (mounted) setState(() => st = v); }, onRefresh: widget.onRefresh, child: widget.child),
    ]);
  }
}

class Brand extends StatelessWidget {
  final VoidCallback? onTap;
  const Brand({super.key, this.onTap});
  @override
  Widget build(BuildContext context) {
    final w = Row(mainAxisSize: MainAxisSize.min, children: [
      const AnimMark(40, auto: true, slow: true, tapPlay: true),
      const SizedBox(width: 10),
      Text('Hulhup', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 21, letterSpacing: -.4, color: ink(context))),
      if (onTap != null) Icon(Icons.keyboard_arrow_down_rounded, size: 22, color: sub(context)),
    ]);
    return onTap == null ? w : Tap(onTap: onTap, scale: .96, child: Padding(padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 6), child: w));
  }
}

class TopBar extends StatelessWidget {
  final Widget? lead, center;
  final String? title;
  final bool back;
  final List<Widget> actions;
  const TopBar({super.key, this.lead, this.center, this.title, this.back = false, this.actions = const []});
  @override
  Widget build(BuildContext context) {
    final w = 48.0 * max(1, actions.length);
    return SafeArea(bottom: false, child: SizedBox(height: 60, child: Row(children: [
      SizedBox(width: w, child: Align(alignment: Alignment.centerLeft, child: back ? IconBtn(Icons.arrow_back_ios_new_rounded, () => Navigator.maybePop(context)) : lead)),
      Expanded(child: Center(child: center ?? Text(title ?? '', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18)))),
      SizedBox(width: w, child: Row(mainAxisAlignment: MainAxisAlignment.end, children: actions)),
    ])));
  }
}

class Avatar extends StatelessWidget {
  final String? url;
  final String name;
  final double size;
  const Avatar(this.url, this.name, this.size, {super.key});
  @override
  Widget build(BuildContext context) {
    final init = Container(width: size, height: size, color: const Color(0xFF2B2B2B), alignment: Alignment.center, child: Text(name.isEmpty ? '?' : name.characters.first.toUpperCase(), style: TextStyle(color: cream, fontWeight: FontWeight.w800, fontSize: size * .42)));
    return ClipOval(child: SizedBox(width: size, height: size, child: url == null ? init : img(url!, fallback: init)));
  }
}

class In extends StatelessWidget {
  final int i;
  final Widget child;
  const In(this.i, this.child, {super.key});
  @override
  Widget build(BuildContext context) => TweenAnimationBuilder<double>(
        tween: Tween(begin: 0, end: 1), duration: Duration(milliseconds: 380 + min(i, 8) * 80), curve: Curves.easeOutCubic,
        builder: (_, v, c) => Opacity(opacity: v, child: Transform.translate(offset: Offset(0, (1 - v) * 20), child: c)), child: child,
      );
}

class Loader extends StatelessWidget {
  const Loader({super.key});
  @override
  Widget build(BuildContext context) => const Center(child: LogoLoop(size: 46));
}

class Empty extends StatelessWidget {
  final IconData icon;
  final String text;
  final Widget? action, custom;
  const Empty(this.icon, this.text, {super.key, this.action, this.custom});
  @override
  Widget build(BuildContext context) => In(0, Padding(padding: const EdgeInsets.all(40), child: Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
        Container(width: 72, height: 72, decoration: BoxDecoration(color: soft(context), shape: BoxShape.circle), child: custom ?? Icon(icon, size: 30, color: sub(context))),
        const SizedBox(height: 14),
        Text(text, textAlign: TextAlign.center, style: TextStyle(color: sub(context), fontSize: 15, height: 1.4)),
        if (action != null) ...[const SizedBox(height: 16), action!],
      ]))));
}

Color acc(BuildContext c) => isDark(c) ? const Color(0xFF7DB4FF) : const Color(0xFF2B6FDE);

enum HK { sorot, comment, hups, acak, save, share, add }

/// Ikon buatan sendiri (garis tipis, ujung bulat): sorot (penanda), komentar, hups, acak, simpan, bagikan.
class HIcon extends StatelessWidget {
  final HK k;
  final bool filled;
  final double size;
  final Color color;
  final Color? hole;
  final double burst; // 0..1: animasi sinar saat sorot dinyalakan
  const HIcon(this.k, {super.key, this.filled = false, this.size = 24, required this.color, this.hole, this.burst = 1});
  @override
  Widget build(BuildContext context) => SizedBox(width: size, height: size, child: CustomPaint(painter: _HPainter(k, filled, color, hole ?? bgOf(context), burst)));
}

class _HPainter extends CustomPainter {
  final HK k;
  final bool filled;
  final Color color, hole;
  final double burst;
  _HPainter(this.k, this.filled, this.color, this.hole, this.burst);

  @override
  void paint(Canvas canvas, Size sz) {
    canvas.scale(sz.width / 24);
    final st = Paint()..color = color..style = PaintingStyle.stroke..strokeWidth = 1.7..strokeCap = StrokeCap.round..strokeJoin = StrokeJoin.round..isAntiAlias = true;
    final fl = Paint()..color = color..style = PaintingStyle.fill..isAntiAlias = true;
    switch (k) {
      case HK.sorot:
        // Lampu sorot: kepala lampu di bawah, berkas cahaya melebar ke atas. Menyala = terisi + garis sinar di LUAR berkas (hitam-putih).
        final head = RRect.fromLTRBR(8.2, 17.6, 15.8, 22.2, const Radius.circular(1.8));
        final beam = Path()..moveTo(8.9, 15.8)..lineTo(15.1, 15.8)..lineTo(19.2, 7.4)..lineTo(4.8, 7.4)..close();
        if (filled) {
          canvas.drawRRect(head, fl);
          canvas.drawPath(beam, fl);
          final t = burst.clamp(0.0, 1.0);
          final ray = Paint()..color = color..style = PaintingStyle.stroke..strokeWidth = 1.6..strokeCap = StrokeCap.round..isAntiAlias = true;
          // tiga sinar di atas berkas: tengah, kiri, kanan (memanjang sesuai animasi)
          void r(Offset from, Offset to) => canvas.drawLine(from, Offset.lerp(from, to, t)!, ray);
          r(const Offset(12, 5.6), const Offset(12, 1.6));
          r(const Offset(6.6, 5.4), const Offset(3.4, 2.2));
          r(const Offset(17.4, 5.4), const Offset(20.6, 2.2));
        } else {
          canvas.drawRRect(head, st);
          canvas.drawPath(beam, st);
        }
      case HK.save:
        final bm = Path()
          ..moveTo(7.5, 3.6)
          ..lineTo(16.5, 3.6)
          ..arcToPoint(const Offset(18, 5.1), radius: const Radius.circular(1.5))
          ..lineTo(18, 20.4)
          ..lineTo(12, 16.2)
          ..lineTo(6, 20.4)
          ..lineTo(6, 5.1)
          ..arcToPoint(const Offset(7.5, 3.6), radius: const Radius.circular(1.5))
          ..close();
        canvas.drawPath(bm, filled ? fl : st);
      case HK.comment:
        final b = Path()
          ..moveTo(6.5, 4)
          ..lineTo(17.5, 4)
          ..arcToPoint(const Offset(21, 7.5), radius: const Radius.circular(3.5))
          ..lineTo(21, 13)
          ..arcToPoint(const Offset(17.5, 16.5), radius: const Radius.circular(3.5))
          ..lineTo(12.4, 16.5)
          ..lineTo(8, 20.4)
          ..lineTo(8, 16.5)
          ..lineTo(6.5, 16.5)
          ..arcToPoint(const Offset(3, 13), radius: const Radius.circular(3.5))
          ..lineTo(3, 7.5)
          ..arcToPoint(const Offset(6.5, 4), radius: const Radius.circular(3.5))
          ..close();
        canvas.drawPath(b, st);
        canvas.drawLine(const Offset(8, 9), const Offset(16, 9), st);
        canvas.drawLine(const Offset(8, 12.2), const Offset(13, 12.2), st);
      case HK.hups:
        canvas.drawCircle(const Offset(5.6, 6), 2.4, st);
        canvas.drawCircle(const Offset(5.6, 17.4), 2.4, st);
        canvas.drawLine(const Offset(5.6, 8.4), const Offset(5.6, 15), st);
        canvas.drawLine(const Offset(10.6, 5), const Offset(20, 5), st);
        canvas.drawLine(const Offset(10.6, 8.4), const Offset(16.4, 8.4), st);
        canvas.drawLine(const Offset(10.6, 16.4), const Offset(20, 16.4), st);
        canvas.drawLine(const Offset(10.6, 19.8), const Offset(15.4, 19.8), st);
      case HK.acak:
        final a = Path()..moveTo(3, 7.5)..lineTo(6.4, 7.5)..cubicTo(10.4, 7.5, 11.4, 16.5, 15.4, 16.5)..lineTo(19.4, 16.5);
        final b = Path()..moveTo(3, 16.5)..lineTo(6.4, 16.5)..cubicTo(10.4, 16.5, 11.4, 7.5, 15.4, 7.5)..lineTo(19.4, 7.5);
        canvas.drawPath(a, st);
        canvas.drawPath(b, st);
        canvas.drawPath(Path()..moveTo(17.2, 14.3)..lineTo(19.4, 16.5)..lineTo(17.2, 18.7), st);
        canvas.drawPath(Path()..moveTo(17.2, 5.3)..lineTo(19.4, 7.5)..lineTo(17.2, 9.7), st);
      case HK.share:
        canvas.drawPath(Path()..moveTo(5, 12.5)..lineTo(5, 18)..arcToPoint(const Offset(7, 20), radius: const Radius.circular(2))..lineTo(17, 20)..arcToPoint(const Offset(19, 18), radius: const Radius.circular(2))..lineTo(19, 12.5), st);
        canvas.drawLine(const Offset(12, 15), const Offset(12, 4), st);
        canvas.drawPath(Path()..moveTo(8, 8)..lineTo(12, 4)..lineTo(16, 8), st);
      case HK.add:
        canvas.drawLine(const Offset(12, 5), const Offset(12, 19), st);
        canvas.drawLine(const Offset(5, 12), const Offset(19, 12), st);
    }
  }

  @override
  bool shouldRepaint(_HPainter o) => o.k != k || o.filled != filled || o.color != color || o.hole != hole || o.burst != burst;
}

/// Tombol ikon + angka (dipakai untuk sorot, komentar, simpan, bagikan). Sorot hitam-putih dengan sinar saat menyala.
class ActBtn extends StatelessWidget {
  final HK k;
  final bool on;
  final int? count;
  final VoidCallback onTap;
  const ActBtn(this.k, this.onTap, {super.key, this.on = false, this.count});
  @override
  Widget build(BuildContext context) {
    final c = on ? (k == HK.sorot ? ink(context) : acc(context)) : sub(context);
    return Tap(
      onTap: onTap,
      child: Padding(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8), child: Row(mainAxisSize: MainAxisSize.min, children: [
        TweenAnimationBuilder<double>(key: ValueKey(on), tween: Tween(begin: on ? 0 : 1, end: 1), duration: const Duration(milliseconds: 520), curve: Curves.easeOutCubic, builder: (_, v, __) => Transform.scale(scale: on ? .78 + .22 * Curves.elasticOut.transform(v.clamp(0.0, 1.0)) : 1, child: HIcon(k, filled: on, size: 23, color: c, burst: v))),
        if (count != null) ...[const SizedBox(width: 6), Text(fmt(count!), style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5, color: c))],
      ])),
    );
  }
}

class LikeBtn extends StatelessWidget {
  final bool liked;
  final int count;
  final VoidCallback onTap;
  const LikeBtn(this.liked, this.count, this.onTap, {super.key});
  @override
  Widget build(BuildContext context) => ActBtn(HK.sorot, onTap, on: liked, count: count);
}

Widget img(String url, {BoxFit fit = BoxFit.cover, Widget? fallback}) {
  final b = Local.bytes(url);
  final fb = fallback ?? const SizedBox();
  final net = url.startsWith('/') ? '${Api.base}$url' : url;
  return b != null ? Image.memory(b, fit: fit, gaplessPlayback: true, errorBuilder: (_, __, ___) => fb) : Image.network(net, fit: fit, errorBuilder: (_, __, ___) => fb);
}

/// Latar profil: penuh lebar, memudar halus ke warna halaman di semua sisi.
class CoverBox extends StatelessWidget {
  final String? url;
  final double h;
  final Widget? over;
  const CoverBox(this.url, this.h, {super.key, this.over});
  @override
  Widget build(BuildContext context) {
    final bg = bgOf(context);
    return SizedBox(height: h, width: double.infinity, child: Stack(fit: StackFit.expand, children: [
      url == null
          ? Container(decoration: const BoxDecoration(gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFF163F2B), Color(0xFF2F6048), Color(0xFF5B9A7A)])), child: Align(alignment: const Alignment(.9, -.6), child: Container(width: 240, height: 240, decoration: BoxDecoration(shape: BoxShape.circle, gradient: RadialGradient(colors: [Colors.white.withValues(alpha: .16), Colors.transparent])))))
          : AnimatedSwitcher(duration: const Duration(milliseconds: 500), child: SizedBox.expand(key: ValueKey(url), child: img(url!, fallback: Container(color: brand)))),
      DecoratedBox(decoration: BoxDecoration(gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [bg.withValues(alpha: .9), bg.withValues(alpha: 0), bg.withValues(alpha: 0), bg.withValues(alpha: .8), bg], stops: const [0, .22, .5, .86, 1]))),
      if (over != null) over!,
    ]));
  }
}

const _months = {
  'id': ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'],
  'en': ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};

/// Tanggal lahir buatan sendiri (tiga roda: tanggal, bulan, tahun). Umur dihitung otomatis.
class BirthField extends StatelessWidget {
  final String label;
  final TextEditingController c;
  const BirthField(this.label, this.c, {super.key});
  @override
  Widget build(BuildContext context) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Padding(padding: const EdgeInsets.only(left: 6, bottom: 6), child: Text(label, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: sub(context)))),
        Tap(onTap: () => pickBirth(context, c), scale: .98, child: Container(
          height: 56, padding: const EdgeInsets.symmetric(horizontal: 18), decoration: BoxDecoration(color: soft(context), borderRadius: BorderRadius.circular(28)),
          child: ListenableBuilder(listenable: c, builder: (_, __) {
            final d = DateTime.tryParse(c.text);
            return Row(children: [
              Expanded(child: AnimatedSwitcher(duration: const Duration(milliseconds: 220), transitionBuilder: (w, a) => FadeTransition(opacity: a, child: SlideTransition(position: Tween(begin: const Offset(0, .3), end: Offset.zero).animate(a), child: w)), child: Align(key: ValueKey(c.text), alignment: Alignment.centerLeft, child: Text(d == null ? '' : '${d.day} ${_months[Store.i.lang]![d.month - 1]} ${d.year}', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w500))))),
              if (d != null) Padding(padding: const EdgeInsets.only(right: 8), child: Text('${Local.ageOf(c.text)} ${Store.i.t('years')}', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: sub(context)))),
              Icon(Icons.unfold_more_rounded, color: sub(context)),
            ]);
          }),
        )),
      ]);
}

Future<void> pickBirth(BuildContext ctx, TextEditingController c) async {
  final init = DateTime.tryParse(c.text) ?? DateTime(DateTime.now().year - 18, 1, 1);
  final r = await sheet<DateTime>(ctx, (_) => _BirthSheet(init));
  if (r != null) c.text = '${r.year.toString().padLeft(4, '0')}-${r.month.toString().padLeft(2, '0')}-${r.day.toString().padLeft(2, '0')}';
}

class _BirthSheet extends StatefulWidget {
  final DateTime init;
  const _BirthSheet(this.init);
  @override
  State<_BirthSheet> createState() => _BirthState();
}

class _BirthState extends State<_BirthSheet> {
  final now = DateTime.now();
  late int d = widget.init.day, m = widget.init.month, y = widget.init.year;
  late final cd = FixedExtentScrollController(initialItem: d - 1), cm = FixedExtentScrollController(initialItem: m - 1), cy = FixedExtentScrollController(initialItem: now.year - y);
  int get days => DateUtils.getDaysInMonth(y, m);
  @override
  void dispose() { cd.dispose(); cm.dispose(); cy.dispose(); super.dispose(); }

  void _fix() {
    if (y == now.year && m > now.month) { m = now.month; cm.animateToItem(m - 1, duration: const Duration(milliseconds: 220), curve: Curves.easeOut); }
    if (d > days) d = days;
    if (y == now.year && m == now.month && d > now.day) d = now.day;
    if (cd.hasClients && cd.selectedItem != d - 1) cd.animateToItem(d - 1, duration: const Duration(milliseconds: 220), curve: Curves.easeOut);
    setState(() {});
  }

  Widget wheel(FixedExtentScrollController c, int n, int flex, String Function(int) t, ValueChanged<int> on) => Expanded(
        flex: flex,
        child: ListWheelScrollView.useDelegate(
          controller: c, itemExtent: 52, diameterRatio: 2.2, perspective: .003, physics: const FixedExtentScrollPhysics(),
          onSelectedItemChanged: (i) { HapticFeedback.selectionClick(); on(i); },
          childDelegate: ListWheelChildBuilderDelegate(childCount: n, builder: (_, i) => Center(child: Text(t(i), style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: ink(context))))),
        ),
      );

  @override
  Widget build(BuildContext context) => Column(mainAxisSize: MainAxisSize.min, children: [
        Text(Store.i.t('age'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
        const SizedBox(height: 8),
        SizedBox(height: 208, child: Stack(children: [
          Center(child: Container(height: 52, decoration: BoxDecoration(color: soft(context), borderRadius: BorderRadius.circular(26)))),
          Row(children: [
            wheel(cd, days, 2, (i) => '${i + 1}', (i) { d = i + 1; _fix(); }),
            wheel(cm, 12, 4, (i) => _months[Store.i.lang]![i], (i) { m = i + 1; _fix(); }),
            wheel(cy, 121, 3, (i) => '${now.year - i}', (i) { y = now.year - i; _fix(); }),
          ]),
        ])),
        const SizedBox(height: 14),
        PBtn(Store.i.t('done'), () => Navigator.pop(context, DateTime(y, m, d))),
      ]);
}

List<String> monthNames(String lang) => _months[lang] ?? _months['id']!;

const audiences = ['public', 'followers', 'following', 'both', 'friend', 'best', 'partner', 'family', 'relations'];
const profileAud = [...audiences, 'me'];
const uploadAud = [...audiences, 'accounts'];
const filterAud = [...audiences, 'me'];
const relKinds = ['friend', 'best', 'partner', 'family'];
final _lblRe = RegExp(r'^L(\d+)$');
/// Tambahkan nama hubungan custom milikku ke daftar pilihan audiens/filter (setelah "Semua hubungan").
List<String> withLabels(List<String> base) {
  final ids = [for (final k in Store.i.me?.labels.keys ?? const <int>[]) 'L$k'];
  if (ids.isEmpty) return base;
  final i = base.indexOf('relations');
  return [...base.sublist(0, i + 1), ...ids, ...base.sublist(i + 1)];
}

IconData audIcon(String v, {bool filter = false}) => (_lblRe.hasMatch(v) ? Icons.label_outline_rounded : filter && v == 'me' ? Icons.move_to_inbox_outlined : const {
      'public': Icons.public_rounded, 'followers': Icons.group_outlined, 'following': Icons.person_add_alt_1_outlined, 'both': Icons.people_alt_outlined,
      'friend': Icons.sentiment_satisfied_alt_rounded, 'best': Icons.star_outline_rounded, 'partner': Icons.favorite_border_rounded, 'family': Icons.home_outlined,
      'relations': Icons.diversity_3_rounded, 'accounts': Icons.person_search_outlined, 'me': Icons.lock_outline_rounded,
      'custom': Icons.label_outline_rounded, 'newlabel': Icons.add_circle_outline_rounded, 'nolabel': Icons.label_off_outlined,
    }[v]) ?? Icons.public_rounded;
String audLabel(String v, {bool filter = false}) {
  final m = _lblRe.firstMatch(v);
  if (m != null) return Store.i.labelName(int.parse(m.group(1)!));
  return Store.i.t(filter && v == 'me' ? 'f_me' : 'a_$v');
}

/// Isian nama hubungan sendiri (maks 100 karakter). Mengembalikan nama, atau null bila dibatalkan.
Future<String?> askLabel(BuildContext context, {String initial = ''}) => sheet<String>(context, (sc) {
      final c = TextEditingController(text: initial);
      final s = Store.i;
      return StatefulBuilder(builder: (_, set) => Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        Padding(padding: const EdgeInsets.only(left: 4, bottom: 4), child: Text(s.t('lbl_title'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18))),
        Padding(padding: const EdgeInsets.only(left: 4, bottom: 12), child: Text(s.t('lbl_note'), style: TextStyle(color: sub(sc), fontSize: 13))),
        TextField(controller: c, autofocus: true, maxLength: 100, onChanged: (_) => set(() {}), decoration: InputDecoration(hintText: s.t('lbl_ph'))),
        const SizedBox(height: 8),
        PBtn(s.t('lbl_save'), c.text.trim().isEmpty ? null : () => Navigator.pop(sc, c.text.trim()), icon: Icons.check_rounded),
      ]));
    });

/// Label audiens satu post (hanya ditampilkan di profil pemilik): ikon + nama pilihan.
Widget audChip(BuildContext context, String rand, {List<String> to = const []}) {
  final l = audSplit(rand).isEmpty ? ['public'] : audSplit(rand);
  final names = l.map((e) => e == 'accounts' && to.isNotEmpty ? '${audLabel(e)}: ${to.map((x) => '@$x').join(', ')}' : audLabel(e)).join(' · ');
  return Row(mainAxisSize: MainAxisSize.min, children: [
    Icon(audIcon(l.first), size: 14, color: sub(context)), const SizedBox(width: 5),
    Flexible(child: Text(names, maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(color: sub(context), fontSize: 12.5, fontWeight: FontWeight.w600))),
  ]);
}

List<String> audSplit(String v) => v.split(',').where((e) => e.isNotEmpty).toList();

/// Teks ringkas untuk satu atau beberapa audiens ("Pengikut · Teman" atau "Pengikut +2").
String audText(String v, {bool filter = false}) {
  final l = audSplit(v);
  if (l.isEmpty) return audLabel('public', filter: filter);
  if (l.length <= 2) return l.map((e) => audLabel(e, filter: filter)).join(' · ');
  return '${audLabel(l.first, filter: filter)} +${l.length - 1}';
}

/// Pilih lebih dari satu audiens (centang). Untuk pengaturan/post, "Publik" dan "Hanya saya" berdiri sendiri; untuk filter semua boleh digabung.
Future<String?> multiSheet(BuildContext context, String title, List<String> opts, String value, {bool filter = false}) => sheet<String>(context, (sc) {
      var sel = audSplit(value).where(opts.contains).toList();
      if (sel.isEmpty) sel = [opts.first];
      return StatefulBuilder(builder: (_, set) {
        void toggle(String v) {
          if (sel.contains(v)) {
            if (sel.length > 1) sel.remove(v);
          } else {
            if (!filter && (v == 'public' || v == 'me')) { sel = [v]; }
            else { sel = [...sel.where((e) => filter || (e != 'public' && e != 'me')), v]; }
          }
          set(() {});
        }
        return Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Padding(padding: const EdgeInsets.only(left: 4, bottom: 2), child: Text(title, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18))),
          Padding(padding: const EdgeInsets.only(left: 4, bottom: 12), child: Text(Store.i.t('multi_note'), style: TextStyle(color: sub(sc), fontSize: 13))),
          ConstrainedBox(
            constraints: BoxConstraints(maxHeight: MediaQuery.of(sc).size.height * .5),
            child: SingleChildScrollView(child: Column(children: [
              for (final v in opts) Tap(onTap: () => toggle(v), scale: .98, child: AnimatedContainer(
                duration: const Duration(milliseconds: 200), margin: const EdgeInsets.only(bottom: 8), padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
                decoration: BoxDecoration(color: sel.contains(v) ? ink(sc).withValues(alpha: .14) : soft(sc), borderRadius: BorderRadius.circular(24)),
                child: Row(children: [Icon(audIcon(v, filter: filter), size: 22, color: ink(sc)), const SizedBox(width: 14), Expanded(child: Text(audLabel(v, filter: filter), style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16))), Icon(sel.contains(v) ? Icons.check_circle_rounded : Icons.radio_button_unchecked_rounded, size: 22, color: sel.contains(v) ? ink(sc) : sub(sc))]),
              )),
            ])),
          ),
          const SizedBox(height: 8),
          PBtn(Store.i.t('multi_done'), () => Navigator.pop(sc, sel.join(',')), icon: Icons.check_rounded),
        ]);
      });
    });

/// Daftar pilihan bergulir (satu pilihan). Mengembalikan nilai yang dipilih.
Future<String?> chooseSheet(BuildContext context, String title, List<String> opts, String? value, {bool filter = false}) => sheet<String>(context, (sc) => Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
      Padding(padding: const EdgeInsets.only(left: 4, bottom: 12), child: Text(title, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18))),
      ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.of(sc).size.height * .6),
        child: SingleChildScrollView(child: Column(children: [
          for (final v in opts) Tap(onTap: () => Navigator.pop(sc, v), scale: .98, child: AnimatedContainer(
            duration: const Duration(milliseconds: 200), margin: const EdgeInsets.only(bottom: 8), padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
            decoration: BoxDecoration(color: v == value ? ink(sc).withValues(alpha: .14) : soft(sc), borderRadius: BorderRadius.circular(24)),
            child: Row(children: [Icon(audIcon(v, filter: filter), size: 22, color: ink(sc)), const SizedBox(width: 14), Expanded(child: Text(audLabel(v, filter: filter), style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16))), if (v == value) Icon(Icons.check_rounded, color: ink(sc))]),
          )),
        ])),
      ),
    ]));

/// Pilihan audiens buatan sendiri.
class Pick extends StatelessWidget {
  final String label, value;
  final ValueChanged<String> on;
  final List<String> opts;
  const Pick(this.label, this.value, this.on, {super.key, this.opts = audiences});
  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Padding(padding: const EdgeInsets.only(left: 6, bottom: 6), child: Text(label, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: sub(context)))),
      Tap(
        scale: .98,
        onTap: () async {
          final r = await multiSheet(context, label, opts, value);
          if (r != null) on(r);
        },
        child: Container(
          height: 56, padding: const EdgeInsets.symmetric(horizontal: 18), decoration: BoxDecoration(color: soft(context), borderRadius: BorderRadius.circular(28)),
          child: Row(children: [Icon(audIcon(audSplit(value).isEmpty ? 'public' : audSplit(value).first), size: 22, color: ink(context)), const SizedBox(width: 12), Expanded(child: Text(audText(value), maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w500))), Icon(Icons.unfold_more_rounded, color: sub(context))]),
        ),
      ),
    ]);
  }
}

/// Lembar pelaporan buatan sendiri: pilih alasan, laporan dikirim ke server.
Future<void> reportSheet(BuildContext context, {int? audio, String? user, int? comment}) => sheet(context, (ctx) {
  final s = Store.i;
  Future<void> send(String r) async {
    Navigator.pop(ctx);
    try {
      await Api.req('POST', '/reports', body: {if (comment != null) 'comment': comment else if (audio != null) 'audio': audio, if (user != null) 'user': user, 'reason': r});
      toast(s.t('report_done'));
    } catch (e) { toast(s.err(e), bad: true); }
  }
  return Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
    Text(s.t('report_title'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 20)),
    const SizedBox(height: 8),
    for (final r in ['abuse', 'sexual', 'violence', 'spam', 'impersonate', 'other'])
      Tap(onTap: () => send(r), child: Padding(padding: const EdgeInsets.symmetric(vertical: 14), child: Row(children: [Expanded(child: Text(s.t('r_$r'), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600))), Icon(Icons.chevron_right_rounded, color: sub(context))]))),
  ]);
});


/// Layar pembuka setelah splash. Mulai dari logo yang sama dengan splash (tidak muncul tiba-tiba): mata menunduk lalu
/// naik, gelombang halus memancar, lalu tulisan Hulhup terbuka huruf demi huruf sementara mata ikut "membaca" ke kanan.
class Intro extends StatefulWidget {
  final Widget child;
  static bool done = false;
  const Intro({super.key, required this.child});
  @override
  State<Intro> createState() => _IntroState();
}

class _IntroState extends State<Intro> with SingleTickerProviderStateMixin {
  late final AnimationController c = AnimationController(vsync: this, duration: const Duration(milliseconds: 3400));
  late bool show = !Intro.done;
  @override
  void initState() {
    super.initState();
    if (show) c.forward().whenComplete(() { Intro.done = true; if (mounted) setState(() => show = false); });
  }
  @override
  void dispose() { c.dispose(); super.dispose(); }
  @override
  Widget build(BuildContext context) {
    if (!show) return widget.child;
    final fg = ink(context), bg = bgOf(context), mc = markColors(context);
    final word = TextStyle(fontFamily: 'Outfit', fontWeight: FontWeight.w700, fontSize: 52, letterSpacing: -1.2, color: fg, height: 1);
    const letters = ['H', 'u', 'l', 'h', 'u', 'p'];
    return Stack(children: [
      widget.child,
      Positioned.fill(child: AnimatedBuilder(animation: c, builder: (_, __) {
        final t = c.value;
        double ramp(double a, double b) => ((t - a) / (b - a)).clamp(0.0, 1.0);
        // mata: menunduk ke balik dinding, lalu naik dengan pantulan
        final down = Curves.easeInCubic.transform(ramp(.05, .17));
        final up = Curves.easeOutBack.transform(ramp(.21, .38));
        final rise = t < .2 ? 1 - down : up;
        final read = Curves.easeInOutCubic.transform(ramp(.40, .84));
        final look = -.4 + 3.0 * read;
        final blink = (t > .88 && t < .95) ? sin((t - .88) / .07 * pi) : 0.0;
        final pop = 1 + .07 * sin(pi * ramp(.21, .45));
        final fade = 1 - Curves.easeIn.transform(ramp(.95, 1));
        final wave = ramp(.22, .62);
        return Opacity(opacity: fade, child: Material(color: bg, child: Stack(alignment: Alignment.center, children: [
          if (wave > 0 && wave < 1) CustomPaint(size: const Size(420, 420), painter: _Wave(wave, mc[0])),
          Center(child: Row(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.center, children: [
            Transform.scale(scale: pop, child: SizedBox(width: 96, height: 96 * .5 / .72, child: CustomPaint(painter: _PeekPainter(mc[0], mc[1], mc[2], rise: rise.clamp(0.0, 1.06), look: look, blink: blink)))),
            ClipRect(child: Align(alignment: Alignment.centerLeft, widthFactor: read, child: Padding(padding: const EdgeInsets.only(left: 14), child: Row(mainAxisSize: MainAxisSize.min, children: [
              for (var i = 0; i < letters.length; i++) Builder(builder: (_) {
                final p = Curves.easeOutCubic.transform((read * 6.6 - i).clamp(0.0, 1.0));
                return Opacity(opacity: p, child: Transform.translate(offset: Offset(0, (1 - p) * 16), child: Text(letters[i], style: word)));
              }),
            ])))),
          ])),
        ])));
      })),
    ]);
  }
}

class _Wave extends CustomPainter {
  final double t;
  final Color c;
  _Wave(this.t, this.c);
  @override
  void paint(Canvas canvas, Size s) {
    final o = s.center(Offset.zero);
    for (var i = 0; i < 2; i++) {
      final k = (t * 1.3 - i * .22).clamp(0.0, 1.0);
      if (k <= 0 || k >= 1) continue;
      canvas.drawCircle(o, 40 + Curves.easeOutCubic.transform(k) * 170, Paint()..style = PaintingStyle.stroke..strokeWidth = 2.4..color = c.withValues(alpha: (1 - k) * .28));
    }
  }
  @override
  bool shouldRepaint(_Wave o) => o.t != t || o.c != c;
}

/// Satu gerak logo. Semua nilai kembali ke posisi diam di awal dan akhir (t = 0 dan 1).
class _M {
  double rise = 1, look = .3, lookY = 0, cross = 0, blink = 0, winkL = 0, winkR = 0, sep = 0, eyeSc = 1, pupSc = 1, wallDy = 0, wallSx = 1, dx = 0, dy = 0, sc = 1, rot = 0;
}

const int kMarkAnims = 50;

/// 50 animasi logo. [v] 0..49, [t] 0..1.
_M markMotion(int v, double t) {
  final m = _M();
  const tau = 2 * pi;
  double r(double a, double b) => ((t - a) / (b - a)).clamp(0.0, 1.0);
  double bp(double a, double b) => sin(pi * r(a, b));
  final s1 = sin(tau * t), c1 = cos(tau * t), ab = sin(tau * t).abs(), fade = 1 - t;
  double cl(double x) => x.clamp(-1.0, 1.0);
  switch (v % kMarkAnims) {
    case 0: m.rise = 1 - bp(.05, .95); break; // menunduk lalu muncul
    case 1: m.blink = max(bp(.1, .3), bp(.4, .6)); break; // kedip dua kali
    case 2: m.look = .3 + 2.6 * s1; break; // lirik kiri-kanan
    case 3: m.dy = -16 * bp(0, 1); break; // lompat
    case 4: m.rot = Curves.easeInOut.transform(t) * tau; break; // putar penuh
    case 5: m.sc = 1 + .22 * ab * fade; m.dy = 4 * ab; break; // melar kenyal
    case 6: m.rot = .28 * sin(3 * tau * t) * fade; break; // goyang
    case 7: m.sc = 1 + .3 * bp(0, 1); m.blink = bp(.55, .75); break; // membesar lalu kedip
    case 8: m.rise = 1 - .85 * ab; m.look = .3 + 1.5 * s1; break; // ngumpet dua kali sambil menoleh
    case 9: m.dx = 9 * sin(4 * tau * t) * fade; m.look = .3 + 2 * sin(4 * tau * t); break; // gemetar
    case 10: m.rise = 1 + .12 * bp(.2, .7); break; // mata menjulur
    case 11: m.blink = max(bp(.05, .2), max(bp(.3, .45), bp(.55, .7))); break; // kedip cepat tiga kali
    case 12: m.lookY = 2.2 * s1; break; // lirik atas-bawah
    case 13: m.look = .3 + 2 * c1 - 2; m.lookY = 2 * s1; break; // pupil berputar
    case 14: m.cross = 2.6 * bp(.1, .9); break; // juling
    case 15: m.sep = .05 * bp(.1, .9); break; // mata merenggang
    case 16: m.sep = -.04 * bp(.1, .9); break; // mata merapat
    case 17: m.eyeSc = 1 + .3 * bp(.1, .9); m.pupSc = 1 + .2 * bp(.1, .9); break; // mata membesar
    case 18: m.eyeSc = 1 - .3 * bp(.1, .9); break; // mata mengecil
    case 19: m.wallDy = .04 * sin(3 * tau * t) * fade; break; // dinding memantul
    case 20: m.wallSx = 1 - .15 * bp(.1, .5) + .1 * bp(.5, .9); break; // dinding mengempis
    case 21: m.dy = -14 * bp(0, .6); m.blink = bp(.6, .8); break; // lompat lalu kedip
    case 22: m.dy = -12 * ab; break; // lompat dua kali
    case 23: m.rot = pi * bp(0, 1); break; // berbalik setengah lalu kembali
    case 24: m.rot = .35 * sin(2 * tau * t) * fade; m.look = .3 + 2 * sin(2 * tau * t); break; // berayun
    case 25: m.dy = 6 * sin(2 * tau * t).abs(); m.sc = 1 + .05 * sin(2 * tau * t).abs(); break; // mengangguk
    case 26: m.dx = 3 * sin(10 * tau * t) * bp(0, 1); break; // menggigil
    case 27: m.dx = 18 * s1; m.look = .3 + 2 * c1 - 2; break; // geser kiri-kanan
    case 28: m.sc = 1 + .35 * bp(0, 1); break; // zoom
    case 29: m.sc = 1 + .12 * (bp(.1, .35) + bp(.45, .7)); break; // detak jantung
    case 30: m.rise = 1 - bp(0, .45); m.blink = bp(.6, .8); break; // cilukba
    case 31: m.blink = .9 * bp(.1, .9); m.rise = 1 - .2 * bp(.1, .9); break; // mengantuk
    case 32: m.winkR = bp(.2, .6); break; // kedip sebelah kanan
    case 33: m.winkL = bp(.2, .6); break; // kedip sebelah kiri
    case 34: m.rise = 1 - .35 * bp(.1, .9); m.look = .3 - 2 * bp(.1, .9); break; // malu
    case 35: m.eyeSc = 1 + .35 * bp(.05, .5); m.pupSc = 1 - .4 * bp(.05, .5); m.dy = -8 * bp(0, .3); break; // kaget
    case 36: m.pupSc = 1 + .6 * s1; break; // pupil membesar mengecil
    case 37: m.look = .3 + 2.4 * cos(3 * tau * t) - 2.4; m.lookY = 2.4 * sin(3 * tau * t); m.rot = .12 * sin(3 * tau * t); break; // pusing
    case 38: m.look = .3 + 2.5 * cl(3 * s1); break; // memindai
    case 39: m.rise = 1 - .4 * bp(.1, .9); m.look = .3 + 2.5 * cl(2 * s1); m.eyeSc = 1 - .15 * bp(.1, .9); break; // curiga
    case 40: m.dy = -12 * ab; m.eyeSc = 1 + .15 * ab; break; // riang melompat
    case 41: m.sc = 1 + .25 * bp(0, 1); m.rise = 1 + .1 * bp(.3, .7); m.blink = bp(.7, .9); break; // dramatis
    case 42: m.sc = 1 + .08 * sin(3 * tau * t) * fade; m.wallSx = 1 + .1 * sin(3 * tau * t) * fade; m.wallDy = .015 * sin(3 * tau * t) * fade; break; // agar-agar
    case 43: m.rot = .2 * bp(.1, .9); m.lookY = -2 * bp(.1, .9); break; // miring penasaran
    case 44: m.rise = t < .7 ? 1 - Curves.easeIn.transform(r(0, .12)) : Curves.easeOutBack.transform(r(.7, .9)); break; // sembunyi lama lalu muncul
    case 45: m.rise = 1 - .9 * sin(3 * pi * t).abs(); break; // mengintip cepat tiga kali
    case 46: m.eyeSc = 1 + .3 * bp(.05, .4); m.dx = 6 * sin(12 * tau * t) * bp(.05, .6); break; // terkejut gemetar
    case 47: m.look = .3 + 2.2 * c1 - 2.2; m.lookY = -2.2 * s1; m.rise = 1 + .08 * bp(.1, .9); break; // memutar bola mata
    case 48: m.look = .3 + 2 * cos(2 * tau * t) - 2; m.lookY = 2 * sin(2 * tau * t); m.sep = .03 * s1; break; // melirik berputar
    default: m.rise = 1 - bp(0, .3); m.dy = -14 * bp(.35, .65); m.sc = 1 + .1 * bp(.35, .65); m.blink = bp(.7, .9); // pamungkas
  }
  return m;
}

/// Logo yang hidup: memainkan 50 animasi bergantian dengan urutan acak. [auto] jalan sendiri; [loop] tanpa jeda (untuk pemuat);
/// [slow] jeda lama (untuk hiasan seperti logo di bilah atas). Ketuk untuk memutar satu animasi bila [tapPlay].
class AnimMark extends StatefulWidget {
  final double width;
  final bool auto, loop, slow, tapPlay;
  final int? first;
  final int ms;
  final List<Color>? colors;
  const AnimMark(this.width, {super.key, this.auto = false, this.loop = false, this.slow = false, this.tapPlay = false, this.first, this.ms = 1700, this.colors});
  @override
  State<AnimMark> createState() => AnimMarkState();
}

class AnimMarkState extends State<AnimMark> with SingleTickerProviderStateMixin {
  static final _rnd = Random();
  late final AnimationController c = AnimationController(vsync: this, duration: Duration(milliseconds: widget.ms));
  int v = 0, _last = -1;
  Timer? _timer;
  bool _still = false;

  @override
  void initState() {
    super.initState();
    v = widget.first ?? _rnd.nextInt(kMarkAnims);
    c.addStatusListener((st) {
      if (st != AnimationStatus.completed || !widget.auto || !mounted) return;
      if (widget.loop) { play(); return; }
      _timer = Timer(Duration(milliseconds: widget.slow ? 5000 + _rnd.nextInt(7000) : 700 + _rnd.nextInt(1300)), () { if (mounted) play(); });
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _still = MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    if (widget.auto && !_still && !c.isAnimating && _timer == null && _last == -1) {
      _timer = Timer(Duration(milliseconds: widget.loop ? 0 : 500), () { if (mounted) { _last = v; c.forward(from: 0); } });
    }
  }

  /// Putar animasi berikutnya (acak, tidak sama dengan yang barusan). [n] memaksa nomor tertentu.
  void play([int? n]) {
    if (!mounted || _still) return;
    _timer?.cancel();
    var x = n ?? _rnd.nextInt(kMarkAnims);
    if (n == null && x == _last) x = (x + 1 + _rnd.nextInt(kMarkAnims - 1)) % kMarkAnims;
    v = _last = x;
    c.forward(from: 0);
  }

  @override
  void dispose() { _timer?.cancel(); c.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) {
    final mc = widget.colors ?? markColors(context);
    final w = widget.width;
    final body = RepaintBoundary(child: AnimatedBuilder(animation: c, builder: (_, __) {
      final m = markMotion(v, c.value);
      return Transform.translate(offset: Offset(m.dx * w / 100, m.dy * w / 100), child: Transform.rotate(angle: m.rot, child: Transform.scale(scale: m.sc,
        child: SizedBox(width: w, height: w * .5 / .72, child: CustomPaint(painter: _PeekPainter(mc[0], mc[1], mc[2], rise: m.rise.clamp(0.0, 1.1), look: m.look, blink: m.blink.clamp(0.0, 1.0), lookY: m.lookY, cross: m.cross, winkL: m.winkL.clamp(0.0, 1.0), winkR: m.winkR.clamp(0.0, 1.0), sep: m.sep, eyeSc: m.eyeSc, pupSc: m.pupSc, wallDy: m.wallDy, wallSx: m.wallSx))))));
    }));
    return widget.tapPlay ? GestureDetector(behavior: HitTestBehavior.opaque, onTap: () => play(), child: body) : body;
  }
}
