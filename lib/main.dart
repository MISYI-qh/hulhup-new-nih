import 'package:flutter/material.dart';
import 'core.dart';
import 'home.dart';
import 'ui.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Store.i.init();
  runApp(const HulhupApp());
  Store.i.refresh();
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
