import 'package:flutter/material.dart';
import 'home.dart';
import 'hups.dart';
import 'pages.dart';
import 'core.dart';
import 'ui.dart';

/// Alamat (URL) setiap halaman: 1 halaman = 1 alamat, bisa dibagikan dan dibuka langsung.
String? pathOf(Widget w) {
  if (w is HomePage) return '/';
  if (w is PostPage) return '/p/${w.id}';
  if (w is ProfilePage) return w.u == null ? '/me' : '/u/${w.u}';
  if (w is FollowsPage) return '/u/${w.u}/${w.kind}';
  if (w is RelationsPage) return '/u/${w.u}/relations';
  if (w is NotifPage) return '/notifications';
  if (w is SettingsPage) return '/settings';
  if (w is SearchPage) return '/search';
  if (w is StreakPage) return '/streak';
  if (w is EditProfilePage) return '/settings/profile';
  if (w is SessionsPage) return '/settings/sessions';
  if (w is OfflinePage) return '/offline';
  if (w is ComposePage) return '/new';
  if (w is GetAppPage) return '/get-app';
  if (w is AuthPage) return '/login';
  if (w is TextPage && w.slug != null) return '/${w.slug}';
  return null;
}

Widget? pageFor(String name) {
  final path = Uri.tryParse(name)?.path ?? name;
  final seg = [for (final x in path.split('/')) if (x.isNotEmpty) Uri.decodeComponent(x)];
  if (seg.isEmpty) return const HomePage();
  final s = Store.i;
  switch (seg[0]) {
    case 'p':
      final id = seg.length > 1 ? int.tryParse(seg[1]) : null;
      return id == null ? null : PostPage(id);
    case 'u':
      if (seg.length == 1) return null;
      if (seg.length == 2) return ProfilePage(seg[1]);
      if (seg[2] == 'relations') return RelationsPage(seg[1]);
      return FollowsPage(seg[1], seg[2]);
    case 'me':
      return ProfilePage(s.me?.username);
    case 'notifications': return const NotifPage();
    case 'settings':
      if (seg.length > 1 && seg[1] == 'profile') return const EditProfilePage();
      if (seg.length > 1 && seg[1] == 'sessions') return const SessionsPage();
      return const SettingsPage();
    case 'search': return const SearchPage();
    case 'streak': return const StreakPage();
    case 'offline': return const OfflinePage();
    case 'new': return const ComposePage();
    case 'get-app': return const GetAppPage();
    case 'login': return const AuthPage();
    case 'about': return TextPage(s.t('about'), s.t('about_t'), slug: 'about');
    case 'policy': return TextPage(s.t('policy'), s.t('policy_t'), slug: 'policy');
    case 'privacy': return TextPage(s.t('privacy'), s.t('privacy_t'), slug: 'privacy');
  }
  return null;
}

Route<dynamic>? generate(RouteSettings st) {
  final w = pageFor(st.name ?? '/');
  if (w == null) return route(NotFoundPage(), name: st.name);
  return route(w, name: st.name);
}

/// Dibuka langsung dari alamat dalam: Beranda di bawah, halaman tujuan di atasnya (tombol kembali tetap ke Beranda).
List<Route<dynamic>> initialRoutes(String initial) {
  if (initial == '/' || initial.isEmpty) return [route(const HomePage(), name: '/')];
  final w = pageFor(initial) ?? NotFoundPage();
  return [route(const HomePage(), name: '/'), route(w, name: initial)];
}

class NotFoundPage extends StatelessWidget {
  NotFoundPage({super.key});
  @override
  Widget build(BuildContext context) => Scaffold(body: Column(children: [
        const TopBar(back: true, title: 'Hulhup'),
        Expanded(child: Empty(Icons.search_off_rounded, Store.i.t('not_found'))),
      ]));
}
