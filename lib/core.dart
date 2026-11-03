import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';
import 'package:audioplayers/audioplayers.dart';
import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

class ApiErr implements Exception {
  final String code;
  ApiErr(this.code);
}

/// Lapisan data. Sekarang semuanya tersimpan lokal di perangkat (Local).
/// Antarmuka sama dengan API server, jadi nanti tinggal diganti ke backend.
class Api {
  static Future<dynamic> req(String m, String p, {Map? body}) => Local.handle(m, p, body);
  static Future<dynamic> raw(String p, Uint8List b, String type) => Local.raw(p, b, type);
  static Future<dynamic> multi(String p, Uint8List b, String name, Map<String, String> f) => Local.multi(p, b, name, f);
}

String? mimeOf(Uint8List b) {
  if (b.length < 12) return null;
  String s(int a, int n) => String.fromCharCodes(b.sublist(a, a + n));
  if (s(0, 4) == 'RIFF') return 'audio/wav';
  if (s(4, 4) == 'ftyp') return 'audio/mp4';
  if (s(0, 4) == 'OggS') return 'audio/ogg';
  if (s(0, 4) == 'fLaC') return 'audio/flac';
  if (s(0, 3) == 'ID3' || (b[0] == 0xFF && (b[1] & 0xE0) == 0xE0)) return 'audio/mpeg';
  if (b[0] == 0x1A && b[1] == 0x45) return 'audio/webm';
  return null;
}

class Local {
  static late SharedPreferences sp;
  static Map<String, dynamic> db = {};
  static String? session;
  static final _cache = <String, Uint8List>{};
  static final _rnd = Random.secure();
  static const _ext = ['m4a', 'mp4', 'aac', 'mp3', 'wav', 'ogg', 'opus', 'webm', 'flac'];

  static Future<void> init(SharedPreferences p) async {
    sp = p;
    final s = sp.getString('db');
    db = s == null ? {'seq': 0, 'users': [], 'audios': [], 'likes': [], 'follows': [], 'notifs': [], 'taps': 0} : jsonDecode(s) as Map<String, dynamic>;
    session = sp.getString('session');
    for (final a in _r('audios')) {
      a['vis'] = const {'all': 'public', 'me': 'followers'}[a['vis']] ?? a['vis'];
      a['rand'] ??= 'public';
      a['pprof'] ??= true;
    }
    for (final u in _r('users')) {
      if (u['birth'] == null) u['birth'] = _iso(DateTime(DateTime.now().year - ((u['age'] as int?) ?? 18), 1, 1));
    }
    await _save();
  }

  static String _iso(DateTime d) => '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  /// Umur dihitung dari tanggal lahir setiap kali dibutuhkan, jadi selalu mengikuti hari ini.
  static int ageOf(String iso) {
    final b = DateTime.tryParse(iso);
    if (b == null) return 0;
    final n = DateTime.now();
    var a = n.year - b.year;
    if (n.month < b.month || (n.month == b.month && n.day < b.day)) a--;
    return a;
  }

  static bool _okBirth(String iso) {
    final b = DateTime.tryParse(iso);
    return b != null && !b.isAfter(DateTime.now()) && ageOf(iso) <= 120;
  }

  /// Apakah [viewer] termasuk audiens [mode] milik [owner]. pengikut = viewer mengikuti owner; mengikuti = owner mengikuti viewer.
  static bool _aud(dynamic mode, Map owner, Map? viewer) {
    if (mode == 'public') return true;
    if (viewer == null) return false;
    if (viewer['id'] == owner['id']) return true;
    final fol = _r('follows').any((f) => f['from'] == viewer['id'] && f['to'] == owner['id']);
    final ing = _r('follows').any((f) => f['from'] == owner['id'] && f['to'] == viewer['id']);
    switch (mode) {
      case 'followers': return fol;
      case 'following': return ing;
      default: return fol || ing;
    }
  }

  static Future<void> _save() => sp.setString('db', jsonEncode(db));
  static Future<void> setSession(String? v) async { session = v; v == null ? await sp.remove('session') : await sp.setString('session', v); }

  static Future<void> _put(String k, Uint8List b) async { _cache[k] = b; await sp.setString('m_$k', base64Encode(b)); }
  static Future<void> _del(String k) async { _cache.remove(k); await sp.remove('m_$k'); }
  static Uint8List? _blob(String k) {
    final c = _cache[k];
    if (c != null) return c;
    final s = sp.getString('m_$k');
    return s == null ? null : _cache[k] = base64Decode(s);
  }
  static Uint8List? bytes(String url) => url.startsWith('mem:') ? _blob(url.substring(4)) : null;

  static List _r(String k) => db[k] as List;
  static Map? _byName(String n) { for (final u in _r('users')) { if (u['username'] == n) return u; } return null; }
  static Map? _byId(int id) { for (final u in _r('users')) { if (u['id'] == id) return u; } return null; }
  static int _next() { final i = (db['seq'] as int) + 1; db['seq'] = i; return i; }
  static int _now() => DateTime.now().millisecondsSinceEpoch;
  static String _salt() => List.generate(16, (_) => _rnd.nextInt(256).toRadixString(16).padLeft(2, '0')).join();
  static String _hash(String salt, String pw) => sha256.convert(utf8.encode('$salt:$pw')).toString();
  static int _cnt(String k, bool Function(dynamic) f) => _r(k).where(f).length;
  static String? _img(Map u, String kind) => u[kind == 'avatar' ? 'av' : 'cv'] == true ? 'mem:u${u['id']}_$kind' : null;

  static Map _uv(Map u, Map? me) {
    final id = u['id'] as int, mine = me != null && me['id'] == id;
    return {
      'username': u['username'], 'name': u['name'], 'bio': u['bio'], 'age': mine ? ageOf(u['birth']) : 0, 'birth': mine ? u['birth'] : '',
      'avatar': _img(u, 'avatar'), 'cover': _img(u, 'cover'),
      'followers': _cnt('follows', (f) => f['to'] == id), 'following': _cnt('follows', (f) => f['from'] == id),
      'audios': _cnt('audios', (a) => a['owner'] == id),
      'is_following': me != null && !mine && _r('follows').any((f) => f['from'] == me['id'] && f['to'] == id), 'is_me': mine,
    };
  }

  static Map _av(Map a, Map? me) {
    final o = _byId(a['owner'])!, id = a['id'];
    return {
      'id': id, 'desc': a['desc'], 'secs': a['secs'], 'popup': a['popup'], 'vis': a['vis'], 'url': 'mem:a$id', 'pprof': a['pprof'] != false, 'rand': a['rand'],
      'likes': _cnt('likes', (l) => l['a'] == id), 'liked': me != null && _r('likes').any((l) => l['a'] == id && l['u'] == me['id']),
      'owner': o['username'], 'owner_name': o['name'], 'owner_avatar': _img(o, 'avatar'),
    };
  }

  static List _mini(Iterable us) => us.map((u) => {'username': u['username'], 'name': u['name'], 'avatar': _img(u, 'avatar')}).toList();

  static void _notify(int to, String type, int actor, int? audio) {
    if (to == actor) return;
    _r('notifs').add({'to': to, 'type': type, 'actor': actor, 'audio': audio, 'created': _now(), 'seen': false});
  }

  static Future<dynamic> handle(String m, String path, Map? b) async {
    final uri = Uri.parse(path), p = uri.path, q = uri.queryParameters;
    final me = session == null ? null : _byName(session!);
    Map need() { if (me == null) throw ApiErr('unauthorized'); return me; }
    RegExpMatch? x;
    final un = RegExp(r'^[a-z0-9_]{3,20}$');

    if (p == '/register' && m == 'POST') {
      final name = '${b!['name'] ?? ''}'.trim(), u = '${b['username'] ?? ''}'.trim().toLowerCase(), pw = '${b['password'] ?? ''}', birth = '${b['birth'] ?? ''}'.trim();
      if (name.isEmpty || name.length > 40) throw ApiErr('bad_name');
      if (!un.hasMatch(u)) throw ApiErr('bad_username');
      if (pw.length < 6 || pw.length > 100) throw ApiErr('bad_password');
      if (!_okBirth(birth)) throw ApiErr('bad_age');
      if (_byName(u) != null) throw ApiErr('username_taken');
      final salt = _salt();
      final row = {'id': _next(), 'username': u, 'name': name, 'bio': '', 'birth': birth, 'salt': salt, 'pass': _hash(salt, pw), 'av': false, 'cv': false, 'created': _now()};
      _r('users').add(row);
      await _save();
      await setSession(u);
      return {'token': 'local', 'user': _uv(row, row)};
    }
    if (p == '/login' && m == 'POST') {
      final row = _byName('${b!['username'] ?? ''}'.trim().toLowerCase());
      if (row == null || _hash(row['salt'], '${b['password'] ?? ''}') != row['pass']) throw ApiErr('bad_credentials');
      await setSession(row['username']);
      return {'token': 'local', 'user': _uv(row, row)};
    }
    if (p == '/logout') { await setSession(null); return {'ok': true}; }
    if (p == '/stats') return {'taps': db['taps']};
    if (p == '/random') {
      db['taps'] = (db['taps'] as int) + 1;
      await _save();
      final all = _r('audios').where((a) => _aud(a['rand'] ?? 'public', _byId(a['owner'])!, me)).toList();
      return {'taps': db['taps'], 'audio': all.isEmpty ? null : _av(all[_rnd.nextInt(all.length)], me)};
    }
    if (p == '/search') {
      final s = (q['q'] ?? '').trim().toLowerCase();
      if (s.isEmpty) return {'users': []};
      return {'users': _mini(_r('users').where((u) => u['username'].startsWith(s) || u['name'].toLowerCase().contains(s)).take(30))};
    }
    if (p == '/me' && m == 'GET') {
      final u = need();
      return {'user': _uv(u, u), 'unread': _cnt('notifs', (n) => n['to'] == u['id'] && n['seen'] == false)};
    }
    if (p == '/me' && m == 'PATCH') {
      final u = need();
      final name = b!.containsKey('name') ? '${b['name']}'.trim() : u['name'] as String;
      final bio = b.containsKey('bio') ? '${b['bio']}'.trim() : u['bio'] as String;
      final nu = b.containsKey('username') ? '${b['username']}'.trim().toLowerCase() : u['username'] as String;
      final birth = b.containsKey('birth') ? '${b['birth']}'.trim() : u['birth'] as String;
      if (name.isEmpty || name.length > 40) throw ApiErr('bad_name');
      if (bio.length > 300) throw ApiErr('bad_bio');
      if (!un.hasMatch(nu)) throw ApiErr('bad_username');
      if (!_okBirth(birth)) throw ApiErr('bad_age');
      if (nu != u['username'] && _byName(nu) != null) throw ApiErr('username_taken');
      u['name'] = name; u['bio'] = bio; u['username'] = nu; u['birth'] = birth;
      await _save();
      await setSession(nu);
      return {'user': _uv(u, u)};
    }
    if (p == '/me/password' && m == 'POST') {
      final u = need();
      if (_hash(u['salt'], '${b!['old'] ?? ''}') != u['pass']) throw ApiErr('bad_credentials');
      final pw = '${b['new'] ?? ''}';
      if (pw.length < 6 || pw.length > 100) throw ApiErr('bad_password');
      final salt = _salt();
      u['salt'] = salt; u['pass'] = _hash(salt, pw);
      await _save();
      return {'ok': true};
    }
    if (p == '/me' && m == 'DELETE') {
      final u = need(), id = u['id'];
      for (final a in _r('audios').where((a) => a['owner'] == id).toList()) { await _del('a${a['id']}'); }
      final mine = _r('audios').where((a) => a['owner'] == id).map((a) => a['id']).toSet();
      _r('likes').removeWhere((l) => l['u'] == id || mine.contains(l['a']));
      _r('notifs').removeWhere((n) => n['to'] == id || n['actor'] == id || mine.contains(n['audio']));
      _r('audios').removeWhere((a) => a['owner'] == id);
      _r('follows').removeWhere((f) => f['from'] == id || f['to'] == id);
      await _del('u${id}_avatar'); await _del('u${id}_cover');
      _r('users').removeWhere((r) => r['id'] == id);
      await _save();
      await setSession(null);
      return {'ok': true};
    }
    if (p == '/me/liked') {
      final u = need();
      final ids = _r('likes').where((l) => l['u'] == u['id']).map((l) => l['a']).toSet();
      return {'audios': _r('audios').where((a) => ids.contains(a['id'])).map((a) => _av(a, u)).toList()};
    }
    if (p == '/notifications') {
      final u = need();
      final rows = _r('notifs').where((n) => n['to'] == u['id']).toList().reversed.take(60).toList();
      final items = rows.map((n) {
        final a = _byId(n['actor']);
        if (a == null) return null;
        String d = '';
        for (final au in _r('audios')) { if (au['id'] == n['audio']) d = au['desc']; }
        return {'type': n['type'], 'created': n['created'], 'seen': n['seen'], 'username': a['username'], 'name': a['name'], 'avatar': _img(a, 'avatar'), 'desc': d};
      }).whereType<Map>().toList();
      for (final n in _r('notifs')) { if (n['to'] == u['id']) n['seen'] = true; }
      await _save();
      return {'items': items};
    }
    x = RegExp(r'^/audios/(\d+)$').firstMatch(p);
    if (x != null && m == 'DELETE') {
      final u = need(), id = int.parse(x[1]!);
      final has = _r('audios').any((a) => a['id'] == id && a['owner'] == u['id']);
      if (!has) throw ApiErr('not_found');
      await _del('a$id');
      _r('audios').removeWhere((a) => a['id'] == id);
      _r('likes').removeWhere((l) => l['a'] == id);
      _r('notifs').removeWhere((n) => n['audio'] == id);
      await _save();
      return {'ok': true};
    }
    x = RegExp(r'^/audios/(\d+)/like$').firstMatch(p);
    if (x != null && m == 'POST') {
      final u = need(), id = int.parse(x[1]!);
      Map? a;
      for (final r in _r('audios')) { if (r['id'] == id) a = r; }
      if (a == null) throw ApiErr('not_found');
      final had = _r('likes').any((l) => l['u'] == u['id'] && l['a'] == id);
      if (had) { _r('likes').removeWhere((l) => l['u'] == u['id'] && l['a'] == id); }
      else { _r('likes').add({'u': u['id'], 'a': id}); _notify(a['owner'], 'like', u['id'], id); }
      await _save();
      return {'liked': !had, 'likes': _cnt('likes', (l) => l['a'] == id)};
    }
    x = RegExp(r'^/users/([a-z0-9_]+)(/follow|/follows)?$').firstMatch(p);
    if (x != null) {
      final u = _byName(x[1]!);
      if (u == null) throw ApiErr('not_found');
      final id = u['id'] as int;
      if (x[2] == null && m == 'GET') {
        final mine = me != null && me['id'] == id;
        final isf = me != null && !mine && _r('follows').any((f) => f['from'] == me['id'] && f['to'] == id);
        final rows = _r('audios').where((a) => a['owner'] == id && (mine || _aud(a['vis'], u, me))).map((a) => _av(a, me)).toList();
        return {'user': _uv(u, me), 'audios': rows};
      }
      if (x[2] == '/follow' && m == 'POST') {
        final mu = need();
        if (mu['id'] == id) throw ApiErr('forbidden');
        final had = _r('follows').any((f) => f['from'] == mu['id'] && f['to'] == id);
        if (had) { _r('follows').removeWhere((f) => f['from'] == mu['id'] && f['to'] == id); }
        else { _r('follows').add({'from': mu['id'], 'to': id}); _notify(id, 'follow', mu['id'], null); }
        await _save();
        return {'following': !had, 'followers': _cnt('follows', (f) => f['to'] == id)};
      }
      if (x[2] == '/follows' && m == 'GET') {
        final followers = q['kind'] != 'following';
        final ids = _r('follows').where((f) => followers ? f['to'] == id : f['from'] == id).map((f) => followers ? f['from'] : f['to']).toSet();
        return {'users': _mini(_r('users').where((r) => ids.contains(r['id'])))};
      }
    }
    throw ApiErr('not_found');
  }

  static Future<dynamic> raw(String p, Uint8List b, String type) async {
    final me = session == null ? null : _byName(session!);
    if (me == null) throw ApiErr('unauthorized');
    final x = RegExp(r'^/me/(avatar|cover)$').firstMatch(p);
    if (x == null) throw ApiErr('not_found');
    if (!RegExp(r'^image/(jpe?g|png|webp)$').hasMatch(type)) throw ApiErr('bad_file');
    if (b.isEmpty || b.length > 3 * 1024 * 1024) throw ApiErr('too_big');
    await _put('u${me['id']}_${x[1]}', b);
    me[x[1] == 'avatar' ? 'av' : 'cv'] = true;
    await _save();
    return {'ok': true};
  }

  static Future<dynamic> multi(String p, Uint8List b, String name, Map<String, String> f) async {
    final me = session == null ? null : _byName(session!);
    if (me == null) throw ApiErr('unauthorized');
    if (!_ext.contains(name.split('.').last.toLowerCase())) throw ApiErr('bad_file');
    if (b.isEmpty || b.length > 3 * 1024 * 1024) throw ApiErr('too_big');
    final id = _next();
    await _put('a$id', b);
    var d = (f['desc'] ?? '').trim();
    if (d.length > 500) d = d.substring(0, 500);
    const ok = ['public', 'followers', 'following', 'both'];
    final vis = ok.contains(f['vis']) ? f['vis'] : 'public', rnd = ok.contains(f['rand']) ? f['rand'] : 'public';
    _r('audios').insert(0, {'id': id, 'owner': me['id'], 'desc': d, 'secs': (int.tryParse(f['secs'] ?? '') ?? 30).clamp(1, 30), 'popup': f['popup'] != '0', 'pprof': f['pprof'] != '0', 'vis': vis, 'rand': rnd, 'created': _now()});
    await _save();
    return {'ok': true};
  }
}

class U {
  final String username, name, bio, birth;
  final String? avatar, cover;
  final int age, audios;
  int followers, following;
  bool isFollowing;
  final bool isMe;
  U.from(Map j)
      : username = j['username'], name = j['name'], bio = j['bio'] ?? '', birth = j['birth'] ?? '', avatar = j['avatar'], cover = j['cover'],
        age = j['age'] ?? 0, audios = j['audios'] ?? 0, followers = j['followers'] ?? 0, following = j['following'] ?? 0,
        isFollowing = j['is_following'] == true, isMe = j['is_me'] == true;
}

class A {
  final int id, secs;
  final String desc, url, vis, owner, ownerName;
  final String? ownerAvatar;
  final bool popup, pprof;
  int likes;
  bool liked;
  A.from(Map j)
      : id = j['id'], secs = j['secs'], desc = j['desc'] ?? '', url = j['url'], vis = j['vis'], owner = j['owner'],
        ownerName = j['owner_name'], ownerAvatar = j['owner_avatar'], popup = j['popup'] == true, pprof = j['pprof'] != false, likes = j['likes'] ?? 0, liked = j['liked'] == true;
}

String mmss(int s) => '${s ~/ 60}:${(s % 60).toString().padLeft(2, '0')}';

String fmt(int n) {
  final s = '$n', b = StringBuffer(), sep = Store.i.lang == 'id' ? '.' : ',';
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 == 0) b.write(sep);
    b.write(s[i]);
  }
  return b.toString();
}

class Store extends ChangeNotifier {
  static final i = Store._();
  Store._();
  U? me;
  int taps = 0, unread = 0;
  String lang = 'id';
  ThemeMode mode = ThemeMode.system;
  int? playing;
  int dur = 0;
  final pos = ValueNotifier<int>(0);
  final _p = AudioPlayer();
  late SharedPreferences _sp;

  String t(String k) => (S[k] ?? [k, k])[lang == 'id' ? 0 : 1];
  String err(Object e) => e is ApiErr ? (S.containsKey('e_${e.code}') ? t('e_${e.code}') : t('e_server')) : t('e_network');

  Future<void> init() async {
    _sp = await SharedPreferences.getInstance();
    lang = _sp.getString('lang') ?? 'id';
    mode = ThemeMode.values[(_sp.getInt('mode') ?? 0).clamp(0, 2)];
    await Local.init(_sp);
    _p.onPositionChanged.listen((d) => pos.value = d.inMilliseconds);
    _p.onDurationChanged.listen((d) => dur = d.inMilliseconds);
    _p.onPlayerComplete.listen((_) { playing = null; if (dur > 0) pos.value = dur; notifyListeners(); });
  }

  Future<void> refresh() async {
    try {
      if (Local.session != null) {
        final j = await Api.req('GET', '/me');
        me = U.from(j['user']);
        unread = j['unread'] ?? 0;
      }
      taps = (await Api.req('GET', '/stats'))['taps'] ?? taps;
    } on ApiErr catch (e) {
      if (e.code == 'unauthorized') await _clear();
    }
    notifyListeners();
  }

  Future<void> _clear() async { await Local.setSession(null); me = null; unread = 0; }

  Future<void> auth(String path, Map body) async {
    final j = await Api.req('POST', path, body: body);
    me = U.from(j['user']);
    notifyListeners();
  }

  Future<void> logout() async {
    try { await Api.req('POST', '/logout'); } catch (_) {}
    await _clear();
    notifyListeners();
  }

  Future<void> deleteAccount() async { await Api.req('DELETE', '/me'); await _clear(); notifyListeners(); }
  void setLang(String l) { lang = l; _sp.setString('lang', l); notifyListeners(); }
  void setMode(ThemeMode m) { mode = m; _sp.setInt('mode', m.index); notifyListeners(); }

  Future<A?> random() async {
    final j = await Api.req('GET', '/random');
    taps = j['taps'] ?? taps;
    notifyListeners();
    return j['audio'] == null ? null : A.from(j['audio']);
  }

  Future<void> play(A a, {bool force = false}) async {
    if (!force && playing == a.id) { await stop(); return; }
    playing = a.id;
    pos.value = 0;
    dur = 0;
    notifyListeners();
    await _p.stop();
    final b = Local.bytes(a.url);
    await _p.play(b != null ? BytesSource(b, mimeType: mimeOf(b)) : UrlSource(a.url));
  }

  Future<void> stop() async {
    await _p.stop();
    playing = null;
    pos.value = 0;
    notifyListeners();
  }

  Future<void> like(A a) async {
    final j = await Api.req('POST', '/audios/${a.id}/like');
    a.liked = j['liked'];
    a.likes = j['likes'];
    notifyListeners();
  }
}

const S = <String, List<String>>{
  'login': ['Masuk', 'Sign in'], 'register': ['Daftar', 'Sign up'], 'name': ['Nama', 'Name'],
  'username': ['Nama pengguna', 'Username'], 'password': ['Kata sandi', 'Password'], 'age': ['Tanggal lahir', 'Date of birth'], 'years': ['tahun', 'years'], 'pprof': ['Tampilkan profil di popup', 'Show profile in popup'], 'who_rand': ['Siapa yang bisa mendengar secara acak', 'Who can hear it randomly'], 'a_public': ['Publik', 'Public'], 'a_followers': ['Pengikut', 'Followers'], 'a_following': ['Mengikuti', 'Following'], 'a_both': ['Pengikut dan mengikuti', 'Followers and following'],
  'guest': ['Akun tamu', 'Guest account'], 'guest_note': ['Masuk untuk mengunggah suara, menyukai, dan mengikuti.', 'Sign in to upload voices, like, and follow.'],
  'logout': ['Keluar', 'Sign out'], 'settings': ['Pengaturan', 'Settings'], 'account': ['Akun', 'Account'], 'general': ['Umum', 'General'],
  'edit_profile': ['Edit profil', 'Edit profile'], 'change_pw': ['Ubah kata sandi', 'Change password'],
  'old_pw': ['Kata sandi lama', 'Current password'], 'new_pw': ['Kata sandi baru', 'New password'],
  'delete_acc': ['Hapus akun', 'Delete account'], 'delete_acc_q': ['Akun, semua audio, dan datamu akan dihapus permanen.', 'Your account, all audio, and data will be permanently deleted.'],
  'cancel': ['Batal', 'Cancel'], 'save': ['Simpan', 'Save'], 'saved': ['Tersimpan', 'Saved'], 'delete': ['Hapus', 'Delete'],
  'delete_audio_q': ['Hapus audio ini? Audio tidak bisa diedit, hanya dihapus.', 'Delete this audio? Audio cannot be edited, only deleted.'],
  'language': ['Bahasa', 'Language'], 'appearance': ['Tampilan', 'Appearance'], 'system': ['Sistem', 'System'], 'light': ['Cerah', 'Light'], 'dark': ['Gelap', 'Dark'],
  'about': ['Tentang Hulhup', 'About Hulhup'], 'policy': ['Kebijakan', 'Policy'], 'privacy': ['Privasi', 'Privacy'],
  'followers': ['Pengikut', 'Followers'], 'following': ['Mengikuti', 'Following'], 'audio': ['Audio', 'Audio'], 'liked': ['Disukai', 'Liked'],
  'upload': ['Unggah audio', 'Upload audio'], 'record': ['Rekam', 'Record'], 'stop': ['Berhenti', 'Stop'], 'pick': ['Pilih file', 'Pick file'],
  'desc': ['Deskripsi', 'Description'], 'bio': ['Bio', 'Bio'], 'popup': ['Tampilkan popup saat diketuk', 'Show popup on tap'],
  'who': ['Siapa boleh melihat di profil', 'Who can see it on profile'], 'v_all': ['Semua', 'Everyone'], 'v_fol': ['Pengikut', 'Followers'], 'v_me': ['Aku', 'Me'],
  'noedit': ['Audio tidak bisa diedit, hanya dihapus.', 'Audio cannot be edited, only deleted.'],
  'search': ['Cari akun', 'Search accounts'], 'notif': ['Notifikasi', 'Notifications'],
  'n_follow': ['mulai mengikutimu', 'started following you'], 'n_like': ['menyukai audiomu', 'liked your audio'],
  'empty_audio': ['Belum ada audio', 'No audio yet'], 'empty_liked': ['Belum ada yang disukai', 'Nothing liked yet'],
  'empty_notif': ['Belum ada notifikasi', 'No notifications yet'], 'empty_search': ['Tidak ada hasil', 'No results'], 'empty_list': ['Belum ada akun', 'No accounts yet'],
  'follow': ['Ikuti', 'Follow'], 'unfollow': ['Mengikuti', 'Following'], 'photo': ['Foto profil', 'Profile photo'], 'cover': ['Latar profil', 'Cover'],
  'change': ['Ganti', 'Change'], 'need_login': ['Masuk dulu untuk melakukan ini', 'Sign in first to do this'],
  'nobody': ['Belum ada suara. Jadilah yang pertama.', 'No voices yet. Be the first.'], 'uploaded': ['Audio terunggah', 'Audio uploaded'],
  'welcome': ['Selamat datang', 'Welcome'], 'too_long': ['Maksimal 30 detik', 'Maximum 30 seconds'], 'mic_denied': ['Izin mikrofon ditolak', 'Microphone permission denied'],
  'preview': ['Dengar', 'Listen'], 'done': ['Selesai', 'Done'], 'retry': ['Coba lagi', 'Retry'], 'untitled': ['Audio tanpa deskripsi', 'Audio without description'],
  'e_network': ['Tidak terhubung ke server', 'Cannot reach the server'], 'e_server': ['Terjadi kesalahan', 'Something went wrong'],
  'e_unauthorized': ['Sesi berakhir, silakan masuk lagi', 'Session expired, please sign in again'],
  'e_username_taken': ['Nama pengguna sudah dipakai', 'Username is already taken'],
  'e_bad_credentials': ['Nama pengguna atau kata sandi salah', 'Wrong username or password'],
  'e_bad_username': ['Nama pengguna 3-20 karakter: huruf kecil, angka, garis bawah', 'Username 3-20 chars: lowercase, digits, underscore'],
  'e_bad_name': ['Nama wajib diisi (maks 40 karakter)', 'Name is required (max 40 chars)'],
  'e_bad_password': ['Kata sandi minimal 6 karakter', 'Password must be at least 6 characters'],
  'e_bad_age': ['Tanggal lahir tidak valid', 'Invalid date of birth'], 'e_bad_bio': ['Bio maksimal 300 karakter', 'Bio max 300 characters'],
  'e_bad_file': ['File tidak valid', 'Invalid file'], 'e_too_big': ['File terlalu besar (maks 3 MB)', 'File too large (max 3 MB)'],
  'e_not_found': ['Tidak ditemukan', 'Not found'],
  'about_t': [
    'Hulhup adalah ruang suara yang sederhana. Ketuk satu tombol, dengarkan suara acak dari orang-orang di seluruh dunia, tanpa perlu masuk.\n\nMasuk hanya jika kamu ingin berbagi suaramu sendiri, menyukai audio, dan mengikuti akun lain.\n\nHulhup adalah produk dari Misyi.\n\nVersi 1.0.0',
    'Hulhup is a simple home for voices. Tap one button and hear a random voice from people around the world, no sign-in needed.\n\nSign in only if you want to share your own voice, like audio, and follow other accounts.\n\nHulhup is a product of Misyi.\n\nVersion 1.0.0'],
  'policy_t': [
    'Dengan memakai Hulhup kamu setuju pada aturan berikut.\n\n1. Audio yang kamu unggah berdurasi maksimal 30 detik dan harus milikmu atau kamu punya izin memakainya.\n2. Dilarang mengunggah konten yang melecehkan, menebar kebencian, mengandung kekerasan atau seksual, melanggar hukum, atau meniru orang lain.\n3. Dilarang spam dan menyalahgunakan layanan.\n4. Kamu memilih siapa yang bisa mendengar audiomu secara acak (publik, pengikut, mengikuti, atau pengikut dan mengikuti) dan siapa yang bisa melihatnya di profilmu. Audio yang dipilih publik dapat didengar siapa saja.\n5. Audio tidak bisa diedit, hanya dihapus. Kamu bebas menghapus audio atau akunmu kapan saja.\n6. Kami dapat menghapus konten atau akun yang melanggar aturan ini.\n7. Hulhup disediakan apa adanya, aturan dapat diperbarui dan versi terbaru selalu ada di halaman ini.',
    'By using Hulhup you agree to the following.\n\n1. Audio you upload is at most 30 seconds and must be yours, or you must have permission to use it.\n2. Do not upload content that harasses, spreads hate, contains violence or sexual material, breaks the law, or impersonates others.\n3. No spam or misuse of the service.\n4. You choose who can hear your audio randomly (public, followers, following, or followers and following) and who can see it on your profile. Public audio can be heard by anyone.\n5. Audio cannot be edited, only deleted. You may delete audio or your account at any time.\n6. We may remove content or accounts that break these rules.\n7. Hulhup is provided as is. These rules may be updated and the latest version is always on this page.'],
  'privacy_t': [
    'Data yang kami simpan: nama, nama pengguna, tanggal lahir, bio, foto profil dan latar, audio yang kamu unggah, serta suka dan pengikut. Tanggal lahir dan usiamu tidak ditampilkan ke pengguna lain.\n\nKata sandi disimpan dalam bentuk hash, tidak pernah dalam bentuk asli.\n\nMikrofon hanya dipakai saat kamu menekan tombol rekam. Galeri hanya dibuka saat kamu memilih foto.\n\nTanpa login, kamu hanya mendengar suara; kami tidak membuat profil tamu.\n\nKami tidak menjual datamu dan tidak menampilkan iklan. Untuk saat ini data hanya disimpan di perangkatmu.\n\nMenghapus audio atau akun akan menghapus file dan datanya secara permanen dari perangkat.',
    'Data we store: name, username, date of birth, bio, profile photo and cover, audio you upload, plus likes and followers. Your date of birth and age are never shown to other users.\n\nPasswords are stored as hashes, never in plain form.\n\nThe microphone is used only when you press record. The gallery opens only when you pick a photo.\n\nWithout signing in you only listen; we do not create guest profiles.\n\nWe do not sell your data and show no ads. For now data is stored only on your device.\n\nDeleting audio or your account permanently removes the files and data from the device.'],
};
