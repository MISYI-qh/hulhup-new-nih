import 'package:flutter/material.dart';
import 'package:flutter_web_plugins/url_strategy.dart';
 import 'routes.dart';
import 'package:flutter/services.dart';
import 'core.dart';
import 'notify.dart';
import 'ui.dart';

Future<void> main() async {
  usePathUrlStrategy();
  WidgetsFlutterBinding.ensureInitialized();
  await Store.i.init();
  Store.i.banner = (m) => toast(m);
  try { await Notifier.init().timeout(const Duration(seconds: 3)); } catch (_) {}
  // Status masuk benar di layar pertama, tapi tidak boleh menahan layar pembuka bila internet mati atau lambat.
  try { await Store.i.refresh().timeout(const Duration(seconds: 3)); } catch (_) {}
  runApp(const HulhupApp());
  WidgetsBinding.instance.addObserver(_Life());
  _boot();
}

/// Catat hari masuk, tampilkan notifikasi/pengingat. Dipanggil saat dibuka dan saat kembali ke depan.
Future<void> _boot() async {
  final n = await Store.i.start();
  if (n != null) {
    await Future.delayed(const Duration(milliseconds: 900));
    toast(Store.i.t('n_streak').replaceAll('{n}', '$n'));
  }
}

class _Life with WidgetsBindingObserver {
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _boot();
  }
}

ThemeData theme(bool dark) {
  final bg = dark ? const Color(0xFF0B0B0B) : const Color(0xFFFFFFFF);
  final prim = dark ? const Color(0xFFF2F2F2) : const Color(0xFF111111);
  return ThemeData(
    useMaterial3: true,
    brightness: dark ? Brightness.dark : Brightness.light,
    scaffoldBackgroundColor: bg,
    fontFamily: 'Outfit',
    colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF111111), brightness: dark ? Brightness.dark : Brightness.light, surface: bg, primary: prim),
    textTheme: Typography.material2021().black.apply(bodyColor: prim, displayColor: prim, fontFamily: 'Outfit'),
    splashFactory: NoSplash.splashFactory,
    highlightColor: Colors.transparent,
  );
}

class HulhupApp extends StatelessWidget {
  const HulhupApp({super.key});
  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: Store.i,
        builder: (_, __) => MaterialApp(
          title: 'Hulhup', debugShowCheckedModeBanner: false, navigatorKey: navKey,
          themeMode: Store.i.mode, theme: theme(false), darkTheme: theme(true),
          scrollBehavior: const MaterialScrollBehavior().copyWith(physics: const BouncingScrollPhysics()),
          builder: (ctx, child) {
            final dk = Theme.of(ctx).brightness == Brightness.dark;
            final bg = dk ? const Color(0xFF0B0B0B) : const Color(0xFFFFFFFF);
            return AnnotatedRegion<SystemUiOverlayStyle>(
              value: SystemUiOverlayStyle(
                statusBarColor: Colors.transparent,
                statusBarIconBrightness: dk ? Brightness.light : Brightness.dark,
                statusBarBrightness: dk ? Brightness.dark : Brightness.light,
                systemNavigationBarColor: bg,
                systemNavigationBarDividerColor: bg,
                systemNavigationBarIconBrightness: dk ? Brightness.light : Brightness.dark,
              ),
              child: Intro(child: MediaQuery(
                data: MediaQuery.of(ctx).copyWith(textScaler: MediaQuery.textScalerOf(ctx).clamp(minScaleFactor: .9, maxScaleFactor: 1.1)),
                child: ColoredBox(color: bg, child: Center(child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 520), child: child!))),
              )),
            );
          },
          initialRoute: '/',
          onGenerateInitialRoutes: initialRoutes,
          onGenerateRoute: generate,
          navigatorObservers: [HomeUrlObserver()],
        ),
      );
}
