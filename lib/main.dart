import 'package:flutter/material.dart';
import 'core.dart';
import 'home.dart';
import 'notify.dart';
import 'ui.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Store.i.init();
  Store.i.banner = (m) => toast(m);
  await Notifier.init();
  await Store.i.refresh(); // status masuk sudah benar di layar pertama
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
  final bg = dark ? const Color(0xFF0E1511) : const Color(0xFFFEFDF9);
  final prim = dark ? const Color(0xFF8CC4A6) : green;
  return ThemeData(
    useMaterial3: true,
    brightness: dark ? Brightness.dark : Brightness.light,
    scaffoldBackgroundColor: bg,
    fontFamily: 'Outfit',
    colorScheme: ColorScheme.fromSeed(seedColor: green, brightness: dark ? Brightness.dark : Brightness.light, surface: bg, primary: prim),
    textTheme: Typography.material2021().black.apply(bodyColor: dark ? const Color(0xFFE9F1EA) : green, displayColor: dark ? const Color(0xFFE9F1EA) : green, fontFamily: 'Outfit'),
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
          home: const HomePage(),
        ),
      );
}
