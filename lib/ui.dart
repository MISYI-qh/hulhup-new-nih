import 'dart:async';
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'core.dart';

const green = Color(0xFF163F2B);
const cream = Color(0xFFFBF6E9);
const heart = Color(0xFFE0524A);
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
        decoration: BoxDecoration(color: onTap == null && !loading ? bg.withValues(alpha: .4) : bg, borderRadius: BorderRadius.circular(26)),
        alignment: Alignment.center,
        child: AnimatedSwitcher(
          duration: const Duration(milliseconds: 200),
          child: loading
              ? SizedBox(key: const ValueKey('l'), width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4, strokeCap: StrokeCap.round, color: fg))
              : Row(key: const ValueKey('t'), mainAxisSize: MainAxisSize.min, children: [
                  if (icon != null) ...[Icon(icon, size: 20, color: fg), const SizedBox(width: 8)],
                  Text(label, style: TextStyle(color: fg, fontWeight: FontWeight.w700, fontSize: 15)),
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
  const Brand({super.key});
  @override
  Widget build(BuildContext context) => Row(mainAxisSize: MainAxisSize.min, children: [
        Container(width: 30, height: 30, decoration: const BoxDecoration(color: green, shape: BoxShape.circle), child: const Logo(30, cream)),
        const SizedBox(width: 9),
        Text('Hulhup', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 21, letterSpacing: -.4, color: ink(context))),
      ]);
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
  final Widget? action;
  const Empty(this.icon, this.text, {super.key, this.action});
  @override
  Widget build(BuildContext context) => In(0, Padding(padding: const EdgeInsets.all(40), child: Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
        Container(width: 72, height: 72, decoration: BoxDecoration(color: soft(context), shape: BoxShape.circle), child: Icon(icon, size: 30, color: sub(context))),
        const SizedBox(height: 14),
        Text(text, textAlign: TextAlign.center, style: TextStyle(color: sub(context), fontSize: 15, height: 1.4)),
        if (action != null) ...[const SizedBox(height: 16), action!],
      ]))));
}

class LikeBtn extends StatelessWidget {
  final bool liked;
  final int count;
  final VoidCallback onTap;
  const LikeBtn(this.liked, this.count, this.onTap, {super.key});
  @override
  Widget build(BuildContext context) => Tap(
        onTap: onTap,
        child: Padding(padding: const EdgeInsets.all(8), child: Row(mainAxisSize: MainAxisSize.min, children: [
          TweenAnimationBuilder<double>(key: ValueKey(liked), tween: Tween(begin: liked ? .5 : 1, end: 1), duration: const Duration(milliseconds: 450), curve: Curves.elasticOut, builder: (_, v, c) => Transform.scale(scale: v, child: c), child: Icon(liked ? Icons.favorite_rounded : Icons.favorite_border_rounded, size: 24, color: liked ? heart : sub(context))),
          const SizedBox(width: 6),
          AnimatedSwitcher(duration: const Duration(milliseconds: 250), transitionBuilder: (w, a) => FadeTransition(opacity: a, child: ScaleTransition(scale: a, child: w)), child: Text('$count', key: ValueKey(count), style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: sub(context)))),
        ])),
      );
}

Widget img(String url, {BoxFit fit = BoxFit.cover, Widget? fallback}) {
  final b = Local.bytes(url);
  final fb = fallback ?? const SizedBox();
  return b != null ? Image.memory(b, fit: fit, gaplessPlayback: true, errorBuilder: (_, __, ___) => fb) : Image.network(url, fit: fit, errorBuilder: (_, __, ___) => fb);
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

const audiences = ['public', 'followers', 'following', 'both'];
IconData audIcon(String v) => const {'public': Icons.public_rounded, 'followers': Icons.group_outlined, 'following': Icons.person_add_alt_1_outlined, 'both': Icons.people_alt_outlined}[v] ?? Icons.public_rounded;

/// Pilihan audiens buatan sendiri (publik, pengikut, mengikuti, pengikut dan mengikuti).
class Pick extends StatelessWidget {
  final String label, value;
  final ValueChanged<String> on;
  const Pick(this.label, this.value, this.on, {super.key});
  @override
  Widget build(BuildContext context) {
    final s = Store.i;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Padding(padding: const EdgeInsets.only(left: 6, bottom: 6), child: Text(label, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: sub(context)))),
      Tap(
        scale: .98,
        onTap: () async {
          final r = await sheet<String>(context, (sc) => Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Padding(padding: const EdgeInsets.only(left: 4, bottom: 12), child: Text(label, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18))),
            for (final v in audiences) Tap(onTap: () => Navigator.pop(sc, v), scale: .98, child: AnimatedContainer(
              duration: const Duration(milliseconds: 200), margin: const EdgeInsets.only(bottom: 8), padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
              decoration: BoxDecoration(color: v == value ? ink(sc).withValues(alpha: .14) : soft(sc), borderRadius: BorderRadius.circular(24)),
              child: Row(children: [Icon(audIcon(v), size: 22, color: ink(sc)), const SizedBox(width: 14), Expanded(child: Text(s.t('a_$v'), style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16))), if (v == value) Icon(Icons.check_rounded, color: ink(sc))]),
            )),
          ]));
          if (r != null) on(r);
        },
        child: Container(
          height: 56, padding: const EdgeInsets.symmetric(horizontal: 18), decoration: BoxDecoration(color: soft(context), borderRadius: BorderRadius.circular(28)),
          child: Row(children: [Icon(audIcon(value), size: 22, color: ink(context)), const SizedBox(width: 12), Expanded(child: Text(s.t('a_$value'), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w500))), Icon(Icons.unfold_more_rounded, color: sub(context))]),
        ),
      ),
    ]);
  }
}
