import 'dart:async';
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'core.dart';

const green = Color(0xFF163F2B);
const cream = Color(0xFFFBF6E9);
const heart = Color(0xFFE0524A);
const leaf = Color(0xFF2F8F5B);
final navKey = GlobalKey<NavigatorState>();

bool isDark(BuildContext c) => Theme.of(c).brightness == Brightness.dark;
Color ink(BuildContext c) => Theme.of(c).colorScheme.primary;
Color sub(BuildContext c) => ink(c).withValues(alpha: .6);
Color soft(BuildContext c) => isDark(c) ? const Color(0xFF17211B) : const Color(0xFFF5F3EA);
Color card(BuildContext c) => isDark(c) ? const Color(0xFF1B2720) : Colors.white;
Color bgOf(BuildContext c) => Theme.of(c).scaffoldBackgroundColor;

Route<T> route<T>(Widget p) => PageRouteBuilder<T>(
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
    final fg = fgc ?? (ghost ? ink(context) : cream);
    final bg = ghost ? soft(context) : (color ?? green);
    return Tap(
      onTap: loading ? null : onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 220), height: 52,
        decoration: BoxDecoration(color: onTap == null && !loading ? bg.withValues(alpha: .4) : bg, gradient: (!ghost && color == null && (onTap != null || loading)) ? const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFF24603F), green]) : null, borderRadius: BorderRadius.circular(26)),
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
          decoration: BoxDecoration(color: card(ctx), borderRadius: BorderRadius.circular(32), boxShadow: [BoxShadow(color: green.withValues(alpha: .18), blurRadius: 40)]),
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
                Expanded(child: PBtn(yes, () => Navigator.pop(ctx, true), color: danger ? heart : green)),
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
          decoration: BoxDecoration(color: widget.bad ? const Color(0xFF7A2A25) : green, borderRadius: BorderRadius.circular(26), boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: .2), blurRadius: 24, offset: const Offset(0, 8))]),
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

class Logo extends StatelessWidget {
  final double size;
  final Color color;
  const Logo(this.size, this.color, {super.key});
  @override
  Widget build(BuildContext context) {
    Widget bar(double h) => Container(width: size * .088, height: size * h, decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(size)));
    Widget dot() => Container(width: size * .118, height: size * .118, decoration: BoxDecoration(color: color, shape: BoxShape.circle));
    return SizedBox(width: size, height: size, child: Row(mainAxisAlignment: MainAxisAlignment.spaceEvenly, children: [dot(), bar(.34), bar(.56), bar(.31), dot()]));
  }
}

class Brand extends StatelessWidget {
  final VoidCallback? onTap;
  const Brand({super.key, this.onTap});
  @override
  Widget build(BuildContext context) {
    final w = Row(mainAxisSize: MainAxisSize.min, children: [
      Container(width: 30, height: 30, decoration: const BoxDecoration(color: green, shape: BoxShape.circle), child: const Logo(30, cream)),
      const SizedBox(width: 9),
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
    final init = Container(width: size, height: size, color: green, alignment: Alignment.center, child: Text(name.isEmpty ? '?' : name.characters.first.toUpperCase(), style: TextStyle(color: cream, fontWeight: FontWeight.w800, fontSize: size * .42)));
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
  Widget build(BuildContext context) => Center(child: SizedBox(width: 30, height: 30, child: CircularProgressIndicator(strokeWidth: 2.8, strokeCap: StrokeCap.round, color: ink(context))));
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

Color acc(BuildContext c) => isDark(c) ? const Color(0xFF5FC08F) : leaf;

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
        // Lampu sorot: kepala lampu kecil di atas, berkas cahaya melebar ke bawah. Menyala = berkas terisi + garis sinar.
        final head = RRect.fromLTRBR(8.2, 2.6, 15.8, 7.4, const Radius.circular(1.8));
        final beam = Path()..moveTo(8.9, 9.2)..lineTo(15.1, 9.2)..lineTo(19.6, 20.6)..lineTo(4.4, 20.6)..close();
        if (filled) {
          canvas.drawRRect(head, fl);
          canvas.drawPath(beam, fl);
          final ray = Paint()..color = hole..style = PaintingStyle.stroke..strokeWidth = 1.5..strokeCap = StrokeCap.round..isAntiAlias = true;
          for (final dx in const [-3.6, 0.0, 3.6]) {
            final e = Offset(12 + dx * 1.35, 18.2);
            final o = const Offset(12, 11.4);
            canvas.drawLine(o, Offset.lerp(o, e, burst.clamp(0.0, 1.0))!, ray);
          }
          if (burst < 1) {
            final glow = Paint()..color = color.withValues(alpha: (1 - burst) * .9)..style = PaintingStyle.stroke..strokeWidth = 1.5..strokeCap = StrokeCap.round..isAntiAlias = true;
            final r = 1 + burst * 2.6;
            canvas.drawLine(Offset(6.2 - r, 6.4 - r * .2), Offset(4.2 - r, 6.4 - r * .2), glow);
            canvas.drawLine(Offset(17.8 + r, 6.4 - r * .2), Offset(19.8 + r, 6.4 - r * .2), glow);
            canvas.drawLine(Offset(5.6 - r, 11 + r * .4), Offset(3.6 - r, 11.4 + r * .5), glow);
            canvas.drawLine(Offset(18.4 + r, 11 + r * .4), Offset(20.4 + r, 11.4 + r * .5), glow);
          }
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
          : AnimatedSwitcher(duration: const Duration(milliseconds: 500), child: SizedBox.expand(key: ValueKey(url), child: img(url!, fallback: Container(color: green)))),
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
IconData audIcon(String v, {bool filter = false}) => (filter && v == 'me' ? Icons.move_to_inbox_outlined : const {
      'public': Icons.public_rounded, 'followers': Icons.group_outlined, 'following': Icons.person_add_alt_1_outlined, 'both': Icons.people_alt_outlined,
      'friend': Icons.sentiment_satisfied_alt_rounded, 'best': Icons.star_outline_rounded, 'partner': Icons.favorite_border_rounded, 'family': Icons.home_outlined,
      'relations': Icons.diversity_3_rounded, 'accounts': Icons.person_search_outlined, 'me': Icons.lock_outline_rounded,
    }[v]) ?? Icons.public_rounded;
String audLabel(String v, {bool filter = false}) => Store.i.t(filter && v == 'me' ? 'f_me' : 'a_$v');

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
    final s = Store.i;
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
