import 'dart:async';
import 'dart:math';
import 'dart:typed_data';
import 'package:audioplayers/audioplayers.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';
import 'core.dart';
import 'ui.dart';

Future<void> likeAudio(A a) async {
  final s = Store.i;
  if (s.me == null) { toast(s.t('need_login')); return; }
  try { await s.like(a); } catch (e) { toast(s.err(e), bad: true); }
}

Future<void> toggleOffline(A a) async {
  final s = Store.i, was = s.isOffline(a.id);
  try { await s.toggleOffline(a); toast(s.t(was ? 'removed_off' : 'saved_off')); } catch (_) { toast(s.t('off_fail'), bad: true); }
}

// ---------- teks ----------
class TextPage extends StatelessWidget {
  final String title, body;
  const TextPage(this.title, this.body, {super.key});
  @override
  Widget build(BuildContext context) => Scaffold(body: Column(children: [
        TopBar(back: true, title: title),
        Expanded(child: SingleChildScrollView(padding: const EdgeInsets.fromLTRB(24, 8, 24, 40), child: In(0, Text(body, style: const TextStyle(fontSize: 16, height: 1.7))))),
      ]));
}

// ---------- masuk / daftar ----------
class AuthPage extends StatefulWidget {
  const AuthPage({super.key});
  @override
  State<AuthPage> createState() => _AuthState();
}

class _AuthState extends State<AuthPage> {
  bool reg = false, busy = false;
  final name = TextEditingController(), user = TextEditingController(), pw = TextEditingController(), age = TextEditingController();

  Future<void> _go() async {
    final s = Store.i;
    setState(() => busy = true);
    try {
      if (reg) {
        await s.auth('/register', {'name': name.text, 'username': user.text, 'password': pw.text, 'birth': age.text});
      } else {
        await s.auth('/login', {'username': user.text, 'password': pw.text});
      }
      if (!mounted) return;
      Navigator.pop(context, true);
      toast('${s.t('welcome')}, ${s.me!.name}');
    } catch (e) {
      toast(s.err(e), bad: true);
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = Store.i;
    return Scaffold(body: Column(children: [
      TopBar(back: true, center: const Brand()),
      Expanded(child: SingleChildScrollView(padding: const EdgeInsets.fromLTRB(24, 12, 24, 40), child: Column(children: [
        In(0, Seg<bool>([(false, s.t('login')), (true, s.t('register'))], reg, (v) => setState(() => reg = v))),
        const SizedBox(height: 24),
        AnimatedSize(duration: const Duration(milliseconds: 320), curve: Curves.easeOutCubic, child: Column(children: [
          if (reg) ...[Field(s.t('name'), name, max: 40), const SizedBox(height: 16)],
          Field(s.t('username'), user, max: 20),
          const SizedBox(height: 16),
          Field(s.t('password'), pw, secret: true),
          if (reg) ...[const SizedBox(height: 16), BirthField(s.t('age'), age)],
        ])),
        const SizedBox(height: 28),
        PBtn(reg ? s.t('register') : s.t('login'), _go, loading: busy),
      ]))),
    ]));
  }
}

// ---------- profil ----------
class AudioRow extends StatelessWidget {
  final A a;
  final bool mine;
  final VoidCallback? onDelete;
  final bool showOwner;
  final Object? scope;
  const AudioRow(this.a, {super.key, this.mine = false, this.onDelete, this.showOwner = false, this.scope});
  @override
  Widget build(BuildContext context) {
    final s = Store.i;
    final vis = audIcon(a.rand);
    return ListenableBuilder(listenable: s, builder: (_, __) {
      final on = s.playing == a.id;
      return Container(
        margin: const EdgeInsets.only(bottom: 10), padding: const EdgeInsets.fromLTRB(12, 12, 6, 12),
        decoration: BoxDecoration(color: soft(context), borderRadius: BorderRadius.circular(26)),
        child: Row(children: [
          Tap(onTap: () => s.play(a, scope: scope).catchError((_) => toast(s.t('e_server'), bad: true)), child: AnimatedContainer(duration: const Duration(milliseconds: 250), width: 46, height: 46, decoration: BoxDecoration(color: on ? ink(context) : green, shape: BoxShape.circle), child: AnimatedSwitcher(duration: const Duration(milliseconds: 200), child: Icon(on ? Icons.pause_rounded : Icons.play_arrow_rounded, key: ValueKey(on), color: on ? bgOf(context) : cream, size: 26)))),
          const SizedBox(width: 12),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(a.desc.trim().isEmpty ? s.t('untitled') : a.desc.trim(), style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15, color: a.desc.trim().isEmpty ? sub(context) : null)),
            const SizedBox(height: 4),
            Row(children: [
              ValueListenableBuilder<int>(valueListenable: s.pos, builder: (_, ms, __) => Text(on ? '${mmss(ms ~/ 1000)} / ${mmss(a.secs)}' : mmss(a.secs), style: TextStyle(color: on ? ink(context) : sub(context), fontSize: 13, fontWeight: FontWeight.w700))),
              if (mine) ...[const SizedBox(width: 10), Icon(vis, size: 15, color: sub(context))],
              if (showOwner) ...[const SizedBox(width: 10), Flexible(child: Text(a.ownerName, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: sub(context), fontSize: 13)))],
              const SizedBox(width: 6),
              Tap(onTap: () => toggleOffline(a), child: Padding(padding: const EdgeInsets.all(4), child: Icon(s.isOffline(a.id) ? Icons.offline_pin_rounded : Icons.download_for_offline_outlined, size: 20, color: s.isOffline(a.id) ? ink(context) : sub(context)))),
            ]),
          ])),
          LikeBtn(a.liked, a.likes, () => likeAudio(a)),
          if (onDelete != null) IconBtn(Icons.delete_outline_rounded, onDelete!, color: sub(context)),
        ]),
      );
    });
  }
}

class ProfilePage extends StatefulWidget {
  final String? u;
  const ProfilePage(this.u, {super.key});
  @override
  State<ProfilePage> createState() => _ProfileState();
}

class _ProfileState extends State<ProfilePage> {
  U? user;
  List<A> list = [], likedList = [];
  bool loading = true, busy = false;
  String? error;
  int tab = 0;
  bool get mine => widget.u != null && widget.u == Store.i.me?.username;

  @override
  void initState() { super.initState(); if (widget.u != null) _load(); }
  @override
  void dispose() { Store.i.leave(this); super.dispose(); }

  Future<void> _load() async {
    try {
      final j = await Api.req('GET', '/users/${widget.u}');
      user = U.from(j['user']);
      list = (j['audios'] as List).map((e) => A.from(e)).toList();
      if (mine) likedList = ((await Api.req('GET', '/me/liked'))['audios'] as List).map((e) => A.from(e)).toList();
      error = null;
    } catch (e) { error = Store.i.err(e); }
    if (mounted) setState(() => loading = false);
  }

  Future<void> _follow() async {
    setState(() => busy = true);
    try {
      final j = await Api.req('POST', '/users/${widget.u}/follow');
      user!.isFollowing = j['following'];
      user!.followers = j['followers'];
    } catch (e) { toast(Store.i.err(e), bad: true); }
    if (mounted) setState(() => busy = false);
  }

  Future<void> _del(A a) async {
    final s = Store.i;
    if (!await confirm(context, s.t('delete'), s.t('delete_audio_q'), s.t('delete'), danger: true)) return;
    try { await Api.req('DELETE', '/audios/${a.id}'); setState(() { list.remove(a); likedList.remove(a); }); } catch (e) { toast(s.err(e), bad: true); }
  }

  Future<void> _edit() async {
    final r = await go<String>(context, const EditProfilePage());
    if (!mounted) return;
    if (r != null && r != widget.u) { Navigator.of(context).pushReplacement(route(ProfilePage(r))); return; }
    _load();
  }

  Widget _stat(int n, String label, String kind) => Tap(onTap: () => go(context, FollowsPage(widget.u!, kind)), child: Row(mainAxisSize: MainAxisSize.min, children: [Text(fmt(n), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17)), const SizedBox(width: 6), Text(label, style: TextStyle(color: sub(context), fontSize: 14))]));

  @override
  Widget build(BuildContext context) {
    final s = Store.i;
    if (widget.u == null) {
      return Scaffold(body: Column(children: [
        const TopBar(back: true),
        Expanded(child: Empty(Icons.person_outline_rounded, '${s.t('guest')}\n${s.t('guest_note')}', action: SizedBox(width: 200, child: PBtn(s.t('login'), () => go(context, const AuthPage()).then((_) { if (mounted && s.me != null) Navigator.of(context).pushReplacement(route(ProfilePage(s.me!.username))); }))))),
      ]));
    }
    return Scaffold(body: Column(children: [
      TopBar(back: true, actions: mine ? [
        ListenableBuilder(listenable: s, builder: (_, __) => IconBtn(Icons.notifications_none_rounded, () async { await go(context, const NotifPage()); s.refresh(); }, dot: s.unread > 0)),
        IconBtn(Icons.tune_rounded, () => go(context, const SettingsPage())),
      ] : []),
      Expanded(child: loading ? const Loader() : error != null ? Empty(Icons.cloud_off_rounded, error!, action: SizedBox(width: 160, child: PBtn(s.t('retry'), () { setState(() => loading = true); _load(); }))) : _body(context, s)),
    ]));
  }

  Widget _body(BuildContext context, Store s) {
    final u = user!, shown = tab == 1 ? likedList : list;
    return RefreshIndicator(color: ink(context), backgroundColor: card(context), onRefresh: _load, child: ListView(padding: const EdgeInsets.only(bottom: 40), children: [
      const SizedBox(height: 10),
      In(0, Padding(padding: const EdgeInsets.symmetric(horizontal: 24), child: Align(alignment: Alignment.centerLeft, child: Container(padding: const EdgeInsets.all(5), decoration: BoxDecoration(color: bgOf(context), shape: BoxShape.circle, boxShadow: [BoxShadow(color: green.withValues(alpha: .16), blurRadius: 28, offset: const Offset(0, 10))]), child: Tap(onTap: u.avatar == null ? null : () => go(context, ImageViewer(u.avatar!, u.name)), scale: .96, child: Avatar(u.avatar, u.name, 96)))))),
      const SizedBox(height: 16),
      Padding(padding: const EdgeInsets.fromLTRB(24, 0, 24, 0), child: In(1, Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(u.name, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 24, letterSpacing: -.5)),
        const SizedBox(height: 2),
        Text(u.username, style: TextStyle(color: sub(context), fontSize: 15)),
        if (u.bio.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 12), child: Text(u.bio, style: const TextStyle(fontSize: 15, height: 1.45))),
        const SizedBox(height: 16),
        Row(children: [_stat(u.followers, s.t('followers'), 'followers'), const SizedBox(width: 22), _stat(u.following, s.t('following'), 'following')]),
        if (mine && (u.streak > 0 || u.days > 0)) Padding(padding: const EdgeInsets.only(top: 14), child: StreakChip(u.streak, u.days)),
        const SizedBox(height: 18),
        if (mine) Row(children: [Expanded(child: PBtn(s.t('edit_profile'), _edit, ghost: true, icon: Icons.edit_outlined)), const SizedBox(width: 10), Expanded(child: PBtn(s.t('upload'), () async { await go(context, const UploadPage()); _load(); }, icon: Icons.add_rounded))])
        else if (s.me != null) PBtn(u.isFollowing ? s.t('unfollow') : s.t('follow'), _follow, loading: busy, ghost: u.isFollowing, icon: u.isFollowing ? Icons.check_rounded : Icons.person_add_alt_1_rounded),
      ]))),
      const SizedBox(height: 22),
      if (mine) Padding(padding: const EdgeInsets.symmetric(horizontal: 24), child: Seg<int>([(0, s.t('audio')), (1, s.t('liked'))], tab, (v) => setState(() => tab = v))),
      const SizedBox(height: 14),
      if (shown.isEmpty) Empty(tab == 1 ? Icons.favorite_border_rounded : Icons.graphic_eq_rounded, tab == 1 ? s.t('empty_liked') : s.t('empty_audio'))
      else Padding(padding: const EdgeInsets.symmetric(horizontal: 20), child: Column(children: [for (var i = 0; i < shown.length; i++) In(i, AudioRow(shown[i], key: ValueKey('${tab}_${shown[i].id}'), scope: this, mine: mine && tab == 0, showOwner: tab == 1, onDelete: mine && tab == 0 ? () => _del(shown[i]) : null))])),
    ]));
  }
}

class FollowsPage extends StatefulWidget {
  final String u, kind;
  const FollowsPage(this.u, this.kind, {super.key});
  @override
  State<FollowsPage> createState() => _FollowsState();
}

class _FollowsState extends State<FollowsPage> {
  List? users;
  String? error;
  @override
  void initState() { super.initState(); _load(); }
  Future<void> _load() async {
    try { users = (await Api.req('GET', '/users/${widget.u}/follows?kind=${widget.kind}'))['users']; } catch (e) { error = Store.i.err(e); }
    if (mounted) setState(() {});
  }
  @override
  Widget build(BuildContext context) => Scaffold(body: Column(children: [
        TopBar(back: true, title: Store.i.t(widget.kind)),
        Expanded(child: users == null && error == null ? const Loader() : error != null ? Empty(Icons.cloud_off_rounded, error!) : users!.isEmpty ? Empty(Icons.group_outlined, Store.i.t('empty_list')) : UserList(users!)),
      ]));
}

class UserTile extends StatelessWidget {
  final Map u;
  final int i;
  const UserTile(this.u, this.i, {super.key});
  @override
  Widget build(BuildContext context) => In(i, Tap(onTap: () => go(context, ProfilePage(u['username'])), child: Container(margin: const EdgeInsets.only(bottom: 10), padding: const EdgeInsets.all(12), decoration: BoxDecoration(color: soft(context), borderRadius: BorderRadius.circular(26)), child: Row(children: [
        Avatar(u['avatar'], u['name'], 46), const SizedBox(width: 12),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(u['name'], maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)), Text(u['username'], style: TextStyle(color: sub(context), fontSize: 13))])),
        Icon(Icons.chevron_right_rounded, color: sub(context)),
      ]))));
}

class UserList extends StatelessWidget {
  final List users;
  const UserList(this.users, {super.key});
  @override
  Widget build(BuildContext context) => ListView.builder(padding: const EdgeInsets.fromLTRB(20, 4, 20, 40), itemCount: users.length, itemBuilder: (_, i) => UserTile(users[i], i));
}

class StreakChip extends StatelessWidget {
  final int streak, days;
  const StreakChip(this.streak, this.days, {super.key});
  @override
  Widget build(BuildContext context) {
    final s = Store.i;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12), decoration: BoxDecoration(color: soft(context), borderRadius: BorderRadius.circular(24)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(Icons.local_fire_department_rounded, size: 28, color: streak > 0 ? const Color(0xFFE8833A) : sub(context)),
        const SizedBox(width: 10),
        Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(s.t('streak_t').replaceAll('{n}', '$streak'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
          Text(s.t('days_total').replaceAll('{n}', '$days'), style: TextStyle(color: sub(context), fontSize: 12.5)),
        ]),
      ]),
    );
  }
}

/// Pratinjau foto layar penuh: cubit untuk memperbesar, ketuk untuk menutup.
class ImageViewer extends StatelessWidget {
  final String url, name;
  const ImageViewer(this.url, this.name, {super.key});
  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: Colors.black,
        body: Stack(children: [
          Positioned.fill(child: GestureDetector(onTap: () => Navigator.maybePop(context), child: InteractiveViewer(minScale: 1, maxScale: 5, child: Center(child: img(url, fit: BoxFit.contain))))),
          SafeArea(child: Align(alignment: Alignment.topRight, child: Padding(padding: const EdgeInsets.all(8), child: IconBtn(Icons.close_rounded, () => Navigator.maybePop(context), color: Colors.white)))),
          Positioned(left: 0, right: 0, bottom: 0, child: SafeArea(child: Padding(padding: const EdgeInsets.all(20), child: Center(child: Text(name, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 16)))))),
        ]),
      );
}

class OfflinePage extends StatefulWidget {
  const OfflinePage({super.key});
  @override
  State<OfflinePage> createState() => _OfflineState();
}

class _OfflineState extends State<OfflinePage> {
  @override
  void dispose() { Store.i.leave(this); super.dispose(); }
  @override
  Widget build(BuildContext context) {
    final s = Store.i;
    return Scaffold(body: Column(children: [
      TopBar(back: true, title: s.t('offline_t')),
      Expanded(child: ListenableBuilder(listenable: s, builder: (_, __) => s.offline.isEmpty
          ? Empty(Icons.download_for_offline_outlined, s.t('empty_offline'))
          : ListView(padding: const EdgeInsets.fromLTRB(20, 4, 20, 40), children: [for (var i = 0; i < s.offline.length; i++) In(i, AudioRow(s.offline[i], key: ValueKey('o${s.offline[i].id}'), showOwner: true, scope: this))]))),
    ]));
  }
}

// ---------- edit profil ----------
class EditProfilePage extends StatefulWidget {
  const EditProfilePage({super.key});
  @override
  State<EditProfilePage> createState() => _EditState();
}

class _EditState extends State<EditProfilePage> {
  final u = Store.i.me!;
  late final name = TextEditingController(text: u.name), user = TextEditingController(text: u.username), bio = TextEditingController(text: u.bio), age = TextEditingController(text: u.birth);
  bool busy = false;
  String? up;

  Future<void> _img(String kind) async {
    final s = Store.i;
    final x = await ImagePicker().pickImage(source: ImageSource.gallery, maxWidth: kind == 'avatar' ? 720 : 1600, imageQuality: 85);
    if (x == null) return;
    setState(() => up = kind);
    try {
      await Api.raw('/me/$kind', await x.readAsBytes(), x.mimeType ?? 'image/jpeg');
      await s.refresh();
    } catch (e) { toast(s.err(e), bad: true); }
    if (mounted) setState(() => up = null);
  }

  Widget _opt(BuildContext sc, IconData i, String t, String v) => Tap(
        onTap: () => Navigator.pop(sc, v), scale: .98,
        child: Container(margin: const EdgeInsets.only(bottom: 8), padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16), decoration: BoxDecoration(color: soft(sc), borderRadius: BorderRadius.circular(24)), child: Row(children: [Icon(i, size: 22, color: ink(sc)), const SizedBox(width: 14), Text(t, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16))])),
      );

  Future<void> _avatarMenu() async {
    final s = Store.i, me = s.me!;
    final r = await sheet<String>(context, (sc) => Column(mainAxisSize: MainAxisSize.min, children: [
      if (me.avatar != null) _opt(sc, Icons.visibility_outlined, s.t('view_photo'), 'view'),
      _opt(sc, Icons.photo_library_outlined, s.t('change_photo'), 'change'),
    ]));
    if (!mounted) return;
    if (r == 'view') { go(context, ImageViewer(me.avatar!, me.name)); } else if (r == 'change') { _img('avatar'); }
  }

  Future<void> _save() async {
    final s = Store.i;
    setState(() => busy = true);
    try {
      final j = await Api.req('PATCH', '/me', body: {'name': name.text, 'username': user.text, 'bio': bio.text, 'birth': age.text});
      await s.refresh();
      toast(s.t('saved'));
      if (mounted) Navigator.pop(context, j['user']['username']);
    } catch (e) { toast(s.err(e), bad: true); if (mounted) setState(() => busy = false); }
  }

  @override
  Widget build(BuildContext context) {
    final s = Store.i, me = s.me!;
    Widget cam(bool busyNow) => Container(color: Colors.black26, child: Center(child: busyNow ? const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2.4, strokeCap: StrokeCap.round, color: cream)) : const Icon(Icons.photo_camera_outlined, color: cream, size: 28)));
    return Scaffold(body: Column(children: [
      TopBar(back: true, title: s.t('edit_profile')),
      Expanded(child: ListView(padding: const EdgeInsets.only(bottom: 40), children: [
        const SizedBox(height: 8),
        In(0, Center(child: Tap(onTap: _avatarMenu, child: Container(padding: const EdgeInsets.all(5), decoration: BoxDecoration(color: bgOf(context), shape: BoxShape.circle, boxShadow: [BoxShadow(color: green.withValues(alpha: .16), blurRadius: 28, offset: const Offset(0, 10))]), child: ClipOval(child: SizedBox(width: 104, height: 104, child: Stack(fit: StackFit.expand, children: [Avatar(me.avatar, me.name, 104), cam(up == 'avatar')]))))))),
        const SizedBox(height: 28),
        Padding(padding: const EdgeInsets.symmetric(horizontal: 24), child: Column(children: [
          In(1, Field(s.t('name'), name, max: 40)), const SizedBox(height: 16),
          In(2, Field(s.t('username'), user, max: 20)), const SizedBox(height: 16),
          In(3, Field(s.t('bio'), bio, max: 300, lines: 4)), const SizedBox(height: 16),
          In(4, BirthField(s.t('age'), age)), const SizedBox(height: 28),
          PBtn(s.t('save'), _save, loading: busy),
        ])),
      ])),
    ]));
  }
}

// ---------- pengaturan ----------
class SettingsPage extends StatelessWidget {
  const SettingsPage({super.key});
  @override
  Widget build(BuildContext context) {
    final s = Store.i;
    Widget label(String t) => Padding(padding: const EdgeInsets.fromLTRB(6, 22, 0, 10), child: Text(t, style: TextStyle(color: sub(context), fontWeight: FontWeight.w700, fontSize: 13)));
    Widget row(IconData i, String t, VoidCallback f, {Color? c}) => Tap(onTap: f, scale: .98, child: Container(margin: const EdgeInsets.only(bottom: 10), padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16), decoration: BoxDecoration(color: soft(context), borderRadius: BorderRadius.circular(24)), child: Row(children: [Icon(i, size: 22, color: c ?? ink(context)), const SizedBox(width: 14), Expanded(child: Text(t, style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16, color: c))), Icon(Icons.chevron_right_rounded, color: sub(context))])));
    return Scaffold(body: Column(children: [
      TopBar(back: true, title: s.t('settings')),
      Expanded(child: ListenableBuilder(listenable: s, builder: (_, __) => ListView(padding: const EdgeInsets.fromLTRB(24, 0, 24, 40), children: [
        if (s.me != null) ...[
          label(s.t('account')),
          row(Icons.edit_outlined, s.t('edit_profile'), () => go(context, const EditProfilePage())),
          row(Icons.key_rounded, s.t('change_pw'), () => sheet(context, (_) => const PwSheet())),
          const SizedBox(height: 6),
          Pick(s.t('pvis'), s.me!.pvis, (v) async { try { await s.setPvis(v); toast(s.t('saved')); } catch (e) { toast(s.err(e), bad: true); } }, opts: const ['public', 'followers', 'following', 'both', 'me']),
          if (!kIsWeb) ...[
            label(s.t('notif')),
            Container(
              padding: const EdgeInsets.fromLTRB(18, 14, 16, 14), decoration: BoxDecoration(color: soft(context), borderRadius: BorderRadius.circular(24)),
              child: Row(children: [
                Icon(Icons.notifications_active_outlined, size: 22, color: ink(context)), const SizedBox(width: 14),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(s.t('remind'), style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16)), const SizedBox(height: 2), Text(s.t('remind_sub'), style: TextStyle(color: sub(context), fontSize: 12.5, height: 1.3))])),
                const SizedBox(width: 10), Toggle(s.remind, s.setRemind),
              ]),
            ),
          ],
        ],
        label(s.t('language')),
        Seg<String>([('id', 'Indonesia'), ('en', 'English')], s.lang, s.setLang),
        label(s.t('appearance')),
        Seg<ThemeMode>([(ThemeMode.system, s.t('system')), (ThemeMode.light, s.t('light')), (ThemeMode.dark, s.t('dark'))], s.mode, s.setMode),
        if (s.me != null) ...[
          label(''),
          row(Icons.logout_rounded, s.t('logout'), () async { await s.logout(); if (context.mounted) Navigator.of(context).popUntil((r) => r.isFirst); }, c: heart),
          row(Icons.delete_outline_rounded, s.t('delete_acc'), () async {
            if (!await confirm(context, s.t('delete_acc'), s.t('delete_acc_q'), s.t('delete'), danger: true)) return;
            try { await s.deleteAccount(); if (context.mounted) Navigator.of(context).popUntil((r) => r.isFirst); } catch (e) { toast(s.err(e), bad: true); }
          }, c: heart),
        ],
      ]))),
    ]));
  }
}

class PwSheet extends StatefulWidget {
  const PwSheet({super.key});
  @override
  State<PwSheet> createState() => _PwState();
}

class _PwState extends State<PwSheet> {
  final o = TextEditingController(), n = TextEditingController();
  bool busy = false;
  @override
  Widget build(BuildContext context) {
    final s = Store.i;
    return Column(mainAxisSize: MainAxisSize.min, children: [
      Field(s.t('old_pw'), o, secret: true), const SizedBox(height: 14),
      Field(s.t('new_pw'), n, secret: true), const SizedBox(height: 20),
      PBtn(s.t('save'), () async {
        setState(() => busy = true);
        try { await Api.req('POST', '/me/password', body: {'old': o.text, 'new': n.text}); if (context.mounted) Navigator.pop(context); toast(s.t('saved')); } catch (e) { toast(s.err(e), bad: true); if (mounted) setState(() => busy = false); }
      }, loading: busy),
    ]);
  }
}

// ---------- cari & notifikasi ----------
class SearchPage extends StatefulWidget {
  const SearchPage({super.key});
  @override
  State<SearchPage> createState() => _SearchState();
}

class _SearchState extends State<SearchPage> {
  final c = TextEditingController();
  Map? res;
  bool busy = false;
  Timer? t;
  @override
  void dispose() { t?.cancel(); c.dispose(); Store.i.leave(this); super.dispose(); }
  void _q(String v) {
    t?.cancel();
    if (v.trim().isEmpty) { setState(() => res = null); return; }
    t = Timer(const Duration(milliseconds: 350), () async {
      setState(() => busy = true);
      try { res = await Api.req('GET', '/search?q=${Uri.encodeQueryComponent(v.trim())}') as Map; } catch (e) { toast(Store.i.err(e), bad: true); }
      if (mounted) setState(() => busy = false);
    });
  }

  Widget _sec(String t) => Padding(padding: const EdgeInsets.fromLTRB(6, 8, 0, 10), child: Text(t, style: TextStyle(color: sub(context), fontWeight: FontWeight.w700, fontSize: 13)));

  Widget _results() {
    final s = Store.i, us = res!['users'] as List, au = (res!['audios'] as List).map((e) => A.from(e)).toList();
    if (us.isEmpty && au.isEmpty) return Empty(Icons.search_off_rounded, s.t('empty_search'));
    return ListView(padding: const EdgeInsets.fromLTRB(20, 0, 20, 40), children: [
      if (us.isNotEmpty) ...[_sec(s.t('sec_acc')), for (var i = 0; i < us.length; i++) UserTile(us[i], i)],
      if (au.isNotEmpty) ...[_sec(s.t('sec_audio')), for (var i = 0; i < au.length; i++) In(i, AudioRow(au[i], key: ValueKey('s${au[i].id}'), showOwner: true, scope: this))],
    ]);
  }

  @override
  Widget build(BuildContext context) => Scaffold(body: Column(children: [
        TopBar(back: true, title: Store.i.t('search')),
        Padding(padding: const EdgeInsets.fromLTRB(20, 0, 20, 14), child: Container(
          height: 54, padding: const EdgeInsets.only(left: 18, right: 6), decoration: BoxDecoration(color: soft(context), borderRadius: BorderRadius.circular(27)),
          child: Row(children: [Icon(Icons.search_rounded, color: sub(context)), const SizedBox(width: 10), Expanded(child: TextField(controller: c, autofocus: true, onChanged: _q, cursorColor: ink(context), style: const TextStyle(fontSize: 16), decoration: InputDecoration(border: InputBorder.none, isDense: true, hintText: Store.i.t('search_hint'), hintStyle: TextStyle(color: sub(context))))), if (busy) const Padding(padding: EdgeInsets.only(right: 12), child: SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2.2)))]),
        )),
        Expanded(child: res == null ? const SizedBox() : _results()),
      ]));
}

class NotifPage extends StatefulWidget {
  const NotifPage({super.key});
  @override
  State<NotifPage> createState() => _NotifState();
}

class _NotifState extends State<NotifPage> {
  List? items;
  String? error;
  @override
  void initState() { super.initState(); _load(); }
  Future<void> _load() async {
    try { items = (await Api.req('GET', '/notifications'))['items']; } catch (e) { error = Store.i.err(e); }
    if (mounted) setState(() {});
  }

  Widget _item(Map n, int i) {
    final s = Store.i;
    final sys = n['type'] == 'streak' || n['type'] == 'missed', like = n['type'] == 'like';
    final bg = n['seen'] == true ? soft(context) : ink(context).withValues(alpha: .12);
    final when = Text(s.ago(n['created'] as int), style: TextStyle(color: sub(context), fontSize: 12));
    if (sys) {
      final txt = s.t(n['type'] == 'streak' ? 'n_streak' : 'n_missed').replaceAll('{n}', '${n['n']}');
      return In(i, Container(margin: const EdgeInsets.only(bottom: 10), padding: const EdgeInsets.all(12), decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(26)), child: Row(children: [
        Container(width: 46, height: 46, decoration: const BoxDecoration(color: green, shape: BoxShape.circle), child: const Center(child: Logo(30, cream))),
        const SizedBox(width: 14),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Row(children: [const Text('Hulhup', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)), const Spacer(), when]), const SizedBox(height: 2), Text(txt, style: const TextStyle(fontSize: 15, height: 1.4))])),
      ])));
    }
    return In(i, Tap(onTap: () => go(context, ProfilePage(n['username'])), child: Container(margin: const EdgeInsets.only(bottom: 10), padding: const EdgeInsets.all(12), decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(26)), child: Row(children: [
      Stack(clipBehavior: Clip.none, children: [Avatar(n['avatar'], n['name'], 46), Positioned(right: -4, bottom: -4, child: Container(width: 22, height: 22, decoration: BoxDecoration(color: like ? heart : green, shape: BoxShape.circle, border: Border.all(color: bgOf(context), width: 2)), child: Icon(like ? Icons.favorite_rounded : Icons.person_add_alt_1_rounded, size: 11, color: cream)))]),
      const SizedBox(width: 14),
      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text.rich(TextSpan(children: [TextSpan(text: n['name'], style: const TextStyle(fontWeight: FontWeight.w800)), TextSpan(text: '  ${like ? s.t('n_like') : s.t('n_follow')}')]), style: const TextStyle(fontSize: 15, height: 1.4)),
        const SizedBox(height: 2), when,
      ])),
    ]))));
  }

  @override
  Widget build(BuildContext context) {
    final s = Store.i, me = s.me;
    return Scaffold(body: Column(children: [
      TopBar(back: true, title: s.t('notif')),
      Expanded(child: items == null && error == null ? const Loader() : error != null ? Empty(Icons.cloud_off_rounded, error!) : ListView(padding: const EdgeInsets.fromLTRB(20, 4, 20, 40), children: [
        if (me != null && (me.streak > 0 || me.days > 0)) Padding(padding: const EdgeInsets.only(bottom: 14), child: Align(alignment: Alignment.centerLeft, child: StreakChip(me.streak, me.days))),
        if (items!.isEmpty) Empty(Icons.notifications_none_rounded, s.t('empty_notif')),
        for (var i = 0; i < items!.length; i++) _item(items![i] as Map, i),
      ])),
    ]));
  }
}

// ---------- unggah ----------
class UploadPage extends StatefulWidget {
  const UploadPage({super.key});
  @override
  State<UploadPage> createState() => _UploadState();
}

class _UploadState extends State<UploadPage> {
  final rec = AudioRecorder();
  final pv = AudioPlayer();
  final desc = TextEditingController();
  Uint8List? bytes;
  String ext = 'm4a';
  int ms = 0;
  bool recording = false, popup = true, pprof = true, busy = false, previewing = false;
  String rand = 'public';
  Timer? timer;

  @override
  void initState() { super.initState(); pv.onPlayerComplete.listen((_) { if (mounted) setState(() => previewing = false); }); }
  @override
  void dispose() { timer?.cancel(); rec.dispose(); pv.dispose(); super.dispose(); }

  Future<void> _rec() async {
    if (recording) return _stop();
    final s = Store.i;
    try {
      if (!await rec.hasPermission()) { toast(s.t('mic_denied'), bad: true); return; }
      final p = kIsWeb ? '' : '${(await getTemporaryDirectory()).path}/h${DateTime.now().millisecondsSinceEpoch}.m4a';
      await rec.start(kIsWeb ? const RecordConfig(encoder: AudioEncoder.wav, numChannels: 1, sampleRate: 16000) : const RecordConfig(encoder: AudioEncoder.aacLc, numChannels: 1), path: p);
      await pv.stop();
      setState(() { recording = true; ms = 0; bytes = null; previewing = false; });
      final t0 = DateTime.now();
      timer = Timer.periodic(const Duration(milliseconds: 100), (_) { setState(() => ms = min(30000, DateTime.now().difference(t0).inMilliseconds)); if (ms >= 30000) _stop(); });
    } catch (_) { toast(s.t('e_server'), bad: true); }
  }

  Future<void> _stop() async {
    timer?.cancel();
    final p = await rec.stop();
    ext = kIsWeb ? 'wav' : 'm4a';
    Uint8List? b;
    if (p != null) { try { b = await XFile(p).readAsBytes(); } catch (_) {} }
    if (mounted) setState(() { recording = false; bytes = b; });
  }

  Future<void> _pick() async {
    final s = Store.i;
    final r = await FilePicker.platform.pickFiles(type: FileType.audio, withData: kIsWeb);
    final f = r?.files.single;
    if (f == null) return;
    if (f.size > 3 * 1024 * 1024) { toast(s.t('e_too_big'), bad: true); return; }
    final b = f.bytes ?? await XFile(f.path!).readAsBytes();
    final tp = AudioPlayer();
    int? secs;
    try { await tp.setSource(BytesSource(b)); secs = (await tp.getDuration())?.inSeconds; } catch (_) {}
    await tp.dispose();
    if (secs == null || secs > 30) { toast(s.t('too_long'), bad: true); return; }
    await pv.stop();
    setState(() { bytes = b; ext = (f.extension ?? 'm4a').toLowerCase(); ms = max(1, secs!) * 1000; previewing = false; });
  }

  Future<void> _preview() async {
    if (bytes == null) return;
    if (previewing) { await pv.stop(); setState(() => previewing = false); return; }
    setState(() => previewing = true);
    await pv.play(BytesSource(bytes!, mimeType: mimeOf(bytes!)));
  }

  Future<void> _send() async {
    final s = Store.i;
    setState(() => busy = true);
    try {
      await Api.multi('/audios', bytes!, 'a.$ext', {'desc': desc.text, 'secs': '${max(1, (ms / 1000).ceil())}', 'popup': popup ? '1' : '0', 'pprof': pprof ? '1' : '0', 'rand': rand});
      if (!mounted) return;
      Navigator.pop(context);
      toast(s.t('uploaded'));
    } catch (e) { toast(s.err(e), bad: true); if (mounted) setState(() => busy = false); }
  }

  @override
  Widget build(BuildContext context) {
    final s = Store.i, p = ink(context);
    return Scaffold(body: Column(children: [
      TopBar(back: true, title: s.t('upload')),
      Expanded(child: ListView(padding: const EdgeInsets.fromLTRB(24, 0, 24, 40), children: [
        In(0, Center(child: SizedBox(width: 190, height: 190, child: Stack(alignment: Alignment.center, children: [
          TweenAnimationBuilder<double>(tween: Tween(end: ms / 30000), duration: const Duration(milliseconds: 120), builder: (_, v, __) => CustomPaint(size: const Size(190, 190), painter: _Arc(v, p))),
          Tap(onTap: _rec, child: AnimatedContainer(duration: const Duration(milliseconds: 300), curve: Curves.easeOutCubic, width: recording ? 92 : 128, height: recording ? 92 : 128, decoration: BoxDecoration(color: recording ? heart : green, borderRadius: BorderRadius.circular(recording ? 28 : 64), boxShadow: [BoxShadow(color: (recording ? heart : green).withValues(alpha: .3), blurRadius: 30, offset: const Offset(0, 12))]), child: Icon(recording ? Icons.stop_rounded : Icons.mic_rounded, color: cream, size: 44))),
        ])))),
        const SizedBox(height: 8),
        Center(child: Text('${mmss((ms / 1000).floor())} / 0:30', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 20))),
        const SizedBox(height: 16),
        Row(children: [
          Expanded(child: PBtn(s.t('pick'), recording ? null : _pick, ghost: true, icon: Icons.audio_file_outlined)),
          if (bytes != null && !recording) ...[const SizedBox(width: 10), Expanded(child: PBtn(s.t('preview'), _preview, ghost: true, icon: previewing ? Icons.pause_rounded : Icons.play_arrow_rounded))],
        ]),
        const SizedBox(height: 24),
        Field(s.t('desc'), desc, max: 200, lines: 4),
        const SizedBox(height: 18),
        Row(children: [Expanded(child: Text(s.t('popup'), style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16))), Toggle(popup, (v) => setState(() => popup = v))]),
        AnimatedSize(duration: const Duration(milliseconds: 300), curve: Curves.easeOutCubic, child: popup ? Padding(padding: const EdgeInsets.only(top: 16), child: Row(children: [Expanded(child: Text(s.t('pprof'), style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16))), Toggle(pprof, (v) => setState(() => pprof = v))])) : const SizedBox(width: double.infinity)),
        const SizedBox(height: 22),
        Pick(s.t('who_rand'), rand, (v) => setState(() => rand = v)),
        const SizedBox(height: 28),
        PBtn(s.t('upload'), bytes == null || recording ? null : _send, loading: busy, icon: Icons.arrow_upward_rounded),
        const SizedBox(height: 12),
        Center(child: Text(s.t('noedit'), style: TextStyle(color: sub(context), fontSize: 13))),
      ])),
    ]));
  }
}

class _Arc extends CustomPainter {
  final double v;
  final Color c;
  _Arc(this.v, this.c);
  @override
  void paint(Canvas canvas, Size s) {
    final r = Rect.fromCircle(center: s.center(Offset.zero), radius: s.width / 2 - 4);
    canvas.drawArc(r, 0, 6.2832, false, Paint()..style = PaintingStyle.stroke..strokeWidth = 5..color = c.withValues(alpha: .1));
    canvas.drawArc(r, -1.5708, 6.2832 * v, false, Paint()..style = PaintingStyle.stroke..strokeWidth = 5..strokeCap = StrokeCap.round..color = c);
  }
  @override
  bool shouldRepaint(_Arc o) => o.v != v || o.c != c;
}
