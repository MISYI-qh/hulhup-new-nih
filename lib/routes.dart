import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'home.dart';
import 'hups.dart';
import 'pages.dart';
import 'core.dart';
import 'extra.dart';
import 'ui.dart';

/// Alamat (URL) setiap halaman: 1 halaman = 1 alamat, bisa dibagikan dan dibuka langsung.
String? pathOf(Widget w) {
  if (w is HomePage) return w.mode0 == 1 ? '/hups' : '/';
  if (w is PostPage) return w.comment == null ? '/p/${w.id}' : '/p/${w.id}/c/${w.comment}';
  if (w is ProfilePage) return profilePath(w.u, w.tab0);
  if (w is FollowsPage) return '/u/${w.u}/${w.kind}';
  if (w is RelationsPage) return '/u/${w.u}/relations';
  if (w is NotifPage) return '/notifications';
  if (w is SettingsPage) return w.section == null ? '/settings' : '/settings/${w.section}';
  if (w is PwPage) return '/settings/password';
  if (w is SearchPage) return '/search';
  if (w is StreakPage) return '/streak';
  if (w is EditProfilePage) return '/settings/profile';
  if (w is SessionsPage) return '/settings/sessions';
  if (w is OfflinePage) return '/offline';
  if (w is ComposePage) return '/new';
  if (w is AuthPage) return '/login';
  if (w is RecoverPage) return '/recover';
  if (w is FaqPage) return '/faq';
  if (w is SentPage) return w.to == null ? '/sent' : '/sent/${w.to}';
  if (w is TextPage && w.slug != null) return '/${w.slug}';
  return null;
}

const _tabNames = ['', 'hups', 'sorot', 'saved'];

/// Alamat profil menurut tab: /u/nama, /u/nama/hups, dan (akun sendiri) /me/sorot, /me/saved.
String profilePath(String? u, int tab) {
  final base = u == null ? '/me' : '/u/$u';
  return tab <= 0 || tab >= _tabNames.length ? base : '$base/${_tabNames[tab]}';
}

/// Ganti alamat di bilah peramban tanpa menambah riwayat.
void syncUrl(String path) {
  if (!kIsWeb) return;
  SystemNavigator.routeInformationUpdated(uri: Uri.parse(path), replace: true);
}

Widget? pageFor(String name) {
  final path = Uri.tryParse(name)?.path ?? name;
  final seg = [for (final x in path.split('/')) if (x.isNotEmpty) Uri.decodeComponent(x)];
  if (seg.isEmpty || seg[0] == 'acak') return const HomePage();
  if (seg[0] == 'hups') return const HomePage(mode0: 1);
  final s = Store.i;
  switch (seg[0]) {
    case 'p':
      final id = seg.length > 1 ? int.tryParse(seg[1]) : null;
      if (id == null) return null;
      return PostPage(id, comment: seg.length > 3 && seg[2] == 'c' ? int.tryParse(seg[3]) : null);
    case 'u':
      if (seg.length == 1) return null;
      if (seg.length == 2) return ProfilePage(seg[1]);
      if (seg[2] == 'relations') return RelationsPage(seg[1]);
      if (seg[2] == 'acak') return ProfilePage(seg[1]);
      if (seg[2] == 'hups') return ProfilePage(seg[1], tab0: 1);
      return FollowsPage(seg[1], seg[2]);
    case 'me':
      final t = seg.length > 1 ? _tabNames.indexOf(seg[1]) : 0;
      return ProfilePage(s.me?.username, tab0: t < 0 ? 0 : t);
    case 'notifications': return const NotifPage();
    case 'settings':
      if (seg.length > 1 && seg[1] == 'profile') return const EditProfilePage();
      if (seg.length > 1 && seg[1] == 'sessions') return const SessionsPage();
      if (seg.length > 1 && seg[1] == 'password') return const PwPage();
      if (seg.length > 1 && const ['account', 'notifications', 'language', 'appearance', 'security'].contains(seg[1])) return SettingsPage(section: seg[1]);
      return const SettingsPage();
    case 'search': return const SearchPage();
    case 'streak': return const StreakPage();
    case 'offline': return const OfflinePage();
    case 'new': return const ComposePage();
    case 'login': return const AuthPage();
    case 'recover': return const RecoverPage();
    case 'faq': return const FaqPage();
    case 'sent': return SentPage(to: seg.length > 1 ? seg[1] : null);
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
  if (w is HomePage) return [route(w, name: initial)];
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

/// Alamat Beranda mengikuti tab (Acak = "/", Hups = "/hups") tanpa menambah riwayat.
void syncHomeUrl() {
  if (!kIsWeb) return;
  SystemNavigator.routeInformationUpdated(uri: Uri.parse(Store.i.homeMode == 1 ? '/hups' : '/'), replace: true);
}

class HomeUrlObserver extends NavigatorObserver {
  @override
  void didPop(Route<dynamic> route, Route<dynamic>? previousRoute) {
    final n = previousRoute?.settings.name;
    if (n == '/' || n == '/hups') { Store.i.homeMode = n == '/hups' ? 1 : Store.i.homeMode; Future.microtask(syncHomeUrl); }
  }
}
