import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';
import 'package:audioplayers/audioplayers.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'notify.dart';

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
    db = s == null ? {'seq': 0, 'users': [], 'audios': [], 'likes': [], 'follows': [], 'notifs': [], 'rels': [], 'taps': 0} : jsonDecode(s) as Map<String, dynamic>;
    db.putIfAbsent('rels', () => []);
    session = sp.getString('session');
    for (final a in _r('audios')) {
      a['vis'] = const {'all': 'public', 'me': 'followers'}[a['vis']] ?? a['vis'];
      a['rand'] ??= 'public';
      a['pprof'] ??= true;
      a['to'] ??= [];
    }
    for (final u in _r('users')) {
      u['pvis'] ??= 'public';
      u['taps'] ??= 0;
      if (u['log'] == null) {
        // Riwayat hari masuk lama tidak tercatat; isi dari rangkaian terakhir.
        final l = DateTime.tryParse(u['last'] ?? '');
        final st = (u['streak'] ?? 0) as int;
        u['log'] = l == null ? [] : [for (var i = st - 1; i >= 0; i--) _iso(DateTime(l.year, l.month, l.day - i))];
      }
      if (u['birth'] == null) u['birth'] = _iso(DateTime(DateTime.now().year - ((u['age'] as int?) ?? 18), 1, 1));
    }
    await _save();
  }

  /// Jadwal pengingat 19.00 terakhir yang sudah lewat: (tanggal ISO, waktu dalam ms).
  static (String, int) _slot() {
    final n = DateTime.now(), d = n.hour >= 19 ? n : DateTime(n.year, n.month, n.day - 1);
    return (_iso(d), DateTime(d.year, d.month, d.day, 19).millisecondsSinceEpoch);
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
  static bool _aud(dynamic mode, Map owner, Map? viewer, {bool self = true}) {
    if (mode == 'public') return true;
    if (viewer == null) return false;
    if (viewer['id'] == owner['id']) return self;
    if (mode == 'me') return false;
    switch (mode) {
      case 'friend':
      case 'best':
      case 'partner':
      case 'family':
        return _relType(viewer['id'], owner['id']) == mode;
      case 'relations':
        return _relType(viewer['id'], owner['id']) != null;
    }
    final fol = _r('follows').any((f) => f['from'] == viewer['id'] && f['to'] == owner['id']);
    final ing = _r('follows').any((f) => f['from'] == owner['id'] && f['to'] == viewer['id']);
    switch (mode) {
      case 'followers': return fol;
      case 'following': return ing;
      case 'both': return fol || ing;
      default: return false;
    }
  }

  /// Hubungan dua pihak (teman, sahabat, pasangan, keluarga). Satu pasangan akun hanya punya satu baris.
  static Map? _rel(int a, int b) {
    for (final r in _r('rels')) {
      if ((r['a'] == a && r['b'] == b) || (r['a'] == b && r['b'] == a)) return r;
    }
    return null;
  }

  static String? _relType(int a, int b) {
    final r = _rel(a, b);
    return r != null && r['status'] == 'active' ? r['type'] as String : null;
  }

  /// Audiens satu audio. 'accounts' = hanya akun yang dipilih pengunggah.
  static bool _audA(Map a, Map? viewer, {bool self = true}) {
    final o = _byId(a['owner'])!;
    final m = a['rand'] ?? 'public';
    if (m == 'accounts') {
      if (viewer == null) return false;
      if (viewer['id'] == o['id']) return self;
      return ((a['to'] as List?) ?? []).contains(viewer['id']);
    }
    return _aud(m, o, viewer, self: self);
  }

  static const filters = ['public', 'followers', 'following', 'both', 'friend', 'best', 'partner', 'family', 'relations', 'me'];
  static const relTypes = ['friend', 'best', 'partner', 'family'];

  static Future<void> _save() => sp.setString('db', jsonEncode(db));
  static Future<void> setSession(String? v) async { session = v; v == null ? await sp.remove('session') : await sp.setString('session', v); }

  static Future<void> _put(String k, Uint8List b) async {
    try {
      if (!await sp.setString('m_$k', base64Encode(b))) throw ApiErr('storage_full');
      _cache[k] = b;
    } on ApiErr {
      rethrow;
    } catch (_) {
      throw ApiErr('storage_full');
    }
  }
  static Future<void> _del(String k) async { _cache.remove(k); await sp.remove('m_$k'); }
  static Uint8List? _blob(String k) {
    final c = _cache[k];
    if (c != null) return c;
    final s = sp.getString('m_$k');
    return s == null ? null : _cache[k] = base64Decode(s);
  }
  static Future<void> putBlob(String k, Uint8List b) => _put(k, b);
  static Future<void> delBlob(String k) => _del(k);
  static int? _lastRand;
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

  /// Rangkaian hari masuk yang masih berlaku (hari ini atau kemarin), selain itu 0.
  static int _streakOf(Map u) {
    final l = u['last'] as String?;
    if (l == null) return 0;
    final d = DateTime.now();
    return (l == _iso(d) || l == _iso(DateTime(d.year, d.month, d.day - 1))) ? ((u['streak'] ?? 0) as int) : 0;
  }

  static Map _uv(Map u, Map? me) {
    final id = u['id'] as int, mine = me != null && me['id'] == id;
    return {
      'username': u['username'], 'name': u['name'], 'bio': u['bio'], 'age': mine ? ageOf(u['birth']) : 0, 'birth': mine ? u['birth'] : '',
      'avatar': _img(u, 'avatar'), 'cover': _img(u, 'cover'),
      'taps': mine ? (u['taps'] ?? 0) : 0, 'pvis': mine ? (u['pvis'] ?? 'public') : '', 'streak': mine ? _streakOf(u) : 0, 'days': mine ? (u['days'] ?? 0) : 0,
      'followers': _cnt('follows', (f) => f['to'] == id), 'following': _cnt('follows', (f) => f['from'] == id),
      'audios': _cnt('audios', (a) => a['owner'] == id),
      'is_following': me != null && !mine && _r('follows').any((f) => f['from'] == me['id'] && f['to'] == id), 'is_me': mine,
    };
  }

  static Map _av(Map a, Map? me) {
    final o = _byId(a['owner'])!, id = a['id'];
    return {
      'id': id, 'desc': a['desc'], 'secs': a['secs'], 'popup': true, 'vis': a['vis'], 'url': 'mem:a$id', 'pprof': a['pprof'] != false, 'rand': a['rand'] ?? 'public', 'created': a['created'] ?? 0,
      'likes': _cnt('likes', (l) => l['a'] == id), 'liked': me != null && _r('likes').any((l) => l['a'] == id && l['u'] == me['id']),
      'owner': o['username'], 'owner_name': o['name'], 'owner_avatar': _img(o, 'avatar'),
    };
  }

  static List _mini(Iterable us) => us.map((u) => {'username': u['username'], 'name': u['name'], 'avatar': _img(u, 'avatar')}).toList();

  /// Dipanggil saat notifikasi suka/ikuti baru dibuat (untuk menampilkan notifikasi HP): (username penerima, jenis, nama pelaku).
  static void Function(String to, String type, String actor, String extra)? onNotify;

  static void _notify(int to, String type, int actor, int? audio, {String extra = ''}) {
    if (to == actor) return;
    if (_r('notifs').any((n) => n['to'] == to && n['type'] == type && n['actor'] == actor && n['audio'] == audio && (n['extra'] ?? '') == extra)) return;
    _r('notifs').add({'to': to, 'type': type, 'actor': actor, 'audio': audio, 'extra': extra, 'created': _now(), 'seen': false});
    final a = _byId(actor), r = _byId(to);
    if (a != null && r != null) onNotify?.call('${r['username']}', type, '${a['name']}', extra);
  }

  static void _sys(int to, String type, int n) {
    _r('notifs').add({'to': to, 'type': type, 'actor': null, 'audio': null, 'n': n, 'created': _now(), 'seen': false});
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
      final row = {'id': _next(), 'username': u, 'name': name, 'bio': '', 'birth': birth, 'salt': salt, 'pass': _hash(salt, pw), 'av': false, 'cv': false, 'created': _now(), 'pvis': 'public', 'taps': 0, 'log': [], 'rem': _slot().$1};
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
    if (p == '/stats') return {'taps': me != null ? (me['taps'] ?? 0) : db['taps']};
    if (p == '/random') {
      // Hitungan ketukan per akun; tamu punya hitungan sendiri.
      final taps = me != null ? ((me['taps'] ?? 0) as int) + 1 : (db['taps'] as int) + 1;
      if (me != null) { me['taps'] = taps; } else { db['taps'] = taps; }
      await _save();
      final f = filters.contains(q['f']) ? q['f']! : 'public';
      final want = f == 'me' ? 'accounts' : f;
      final all = _r('audios').where((a) => (a['rand'] ?? 'public') == want && _audA(a, me, self: false)).toList();
      // Acak sungguhan (Random.secure), hanya tidak mengulang audio yang sama dua kali berturut-turut bila ada pilihan lain.
      var pool = all;
      if (pool.length > 1 && _lastRand != null) pool = pool.where((a) => a['id'] != _lastRand).toList();
      final pick = pool.isEmpty ? null : pool[_rnd.nextInt(pool.length)];
      _lastRand = pick?['id'];
      return {'taps': taps, 'audio': pick == null ? null : _av(pick, me)};
    }
    if (p == '/search') {
      final s = (q['q'] ?? '').trim().toLowerCase();
      if (s.isEmpty) return {'users': [], 'audios': []};
      final au = _r('audios').where((a) {
        final o = _byId(a['owner']);
        return o != null && '${a['desc']}'.toLowerCase().contains(s) && _aud(o['pvis'] ?? 'public', o, me);
      }).take(30).map((a) => _av(a, me)).toList();
      return {'users': _mini(_r('users').where((u) => u['username'].startsWith(s) || u['name'].toLowerCase().contains(s)).take(30)), 'audios': au};
    }
    if (p == '/me' && m == 'GET') {
      final u = need();
      return {'user': _uv(u, u), 'unread': _cnt('notifs', (n) => n['to'] == u['id'] && n['seen'] == false), 'unread_social': _cnt('notifs', (n) => n['to'] == u['id'] && n['seen'] == false && (n['type'] == 'like' || n['type'] == 'follow' || n['type'] == 'rel_req' || n['type'] == 'rel_ok'))};
    }
    if (p == '/me/settings' && m == 'PATCH') {
      final u = need();
      final v = b!['pvis'];
      if (!filters.contains(v)) throw ApiErr('bad_file');
      u['pvis'] = v;
      await _save();
      return {'user': _uv(u, u)};
    }
    if (p == '/me/checkin' && m == 'POST') {
      final u = need(), now = DateTime.now(), today = _iso(now), last = u['last'] as String?;
      var isNew = false;
      if (last != today) {
        isNew = true;
        var missed = 0;
        if (last != null && last == _iso(DateTime(now.year, now.month, now.day - 1))) {
          u['streak'] = ((u['streak'] ?? 0) as int) + 1;
        } else {
          if (last != null) missed = max(0, DateTime.parse(today).difference(DateTime.parse(last)).inDays - 1);
          u['streak'] = 1;
        }
        u['days'] = ((u['days'] ?? 0) as int) + 1;
        u['last'] = today;
        final lg = (u['log'] as List?) ?? (u['log'] = []);
        if (!lg.contains(today)) lg.add(today);
        if (lg.length > 800) lg.removeRange(0, lg.length - 800);
        if (missed > 0) _sys(u['id'], 'missed', missed);
        _sys(u['id'], 'streak', u['streak']);
        await _save();
      }
      return {'streak': _streakOf(u), 'days': u['days'] ?? 0, 'new': isNew};
    }
    if (p == '/me/log' && m == 'GET') {
      final u = need();
      final lg = List<String>.from((u['log'] as List?) ?? [])..sort();
      return {'days': lg, 'streak': _streakOf(u), 'total': u['days'] ?? 0};
    }
    if (p == '/me/reminders' && m == 'POST') {
      // Catat notifikasi "Kamu lelah?" jam 19.00 yang sudah lewat ke daftar notifikasi di aplikasi.
      final u = need(), slot = _slot();
      if (b?['test'] == true) {
        _r('notifs').add({'to': u['id'], 'type': 'tired', 'actor': null, 'audio': null, 'n': 0, 'created': _now(), 'seen': false});
        await _save();
        return {'ok': true, 'added': true};
      }
      final fresh = u['rem'] != null && u['rem'] != slot.$1 && b?['on'] != false;
      if (fresh) _r('notifs').add({'to': u['id'], 'type': 'tired', 'actor': null, 'audio': null, 'n': 0, 'created': slot.$2, 'seen': false});
      u['rem'] = slot.$1;
      await _save();
      return {'ok': true, 'added': fresh};
    }
    x = RegExp(r'^/me/followers/([a-z0-9_]+)$').firstMatch(p);
    if (x != null && m == 'DELETE') {
      // Batalkan orang yang mengikuti kita (dia tidak diberi tahu).
      final u = need(), f = _byName(x[1]!);
      if (f == null) throw ApiErr('not_found');
      _r('follows').removeWhere((r) => r['from'] == f['id'] && r['to'] == u['id']);
      _r('notifs').removeWhere((n) => n['type'] == 'follow' && n['actor'] == f['id'] && n['to'] == u['id']);
      await _save();
      return {'followers': _cnt('follows', (r) => r['to'] == u['id'])};
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
    x = RegExp(r'^/me/(avatar|cover)$').firstMatch(p);
    if (x != null && m == 'DELETE') {
      final u = need();
      await _del('u${u['id']}_${x[1]}');
      u[x[1] == 'avatar' ? 'av' : 'cv'] = false;
      await _save();
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
      _r('rels').removeWhere((r) => r['a'] == id || r['b'] == id);
      for (final a in _r('audios')) { (a['to'] as List?)?.remove(id); }
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
        if (n['actor'] == null) return {'type': n['type'], 'created': n['created'], 'seen': n['seen'], 'n': n['n'], 'username': '', 'name': 'Hulhup', 'avatar': null, 'desc': ''};
        final a = _byId(n['actor']);
        if (a == null) return null;
        String d = '';
        for (final au in _r('audios')) { if (au['id'] == n['audio']) d = au['desc']; }
        return {'type': n['type'], 'created': n['created'], 'seen': n['seen'], 'username': a['username'], 'name': a['name'], 'avatar': _img(a, 'avatar'), 'desc': d, 'extra': n['extra'] ?? ''};
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
    if (p == '/relations' && m == 'POST') {
      final mu = need(), t = '${b!['type']}', o = _byName('${b['to']}'.toLowerCase());
      if (!relTypes.contains(t)) throw ApiErr('bad_file');
      if (o == null) throw ApiErr('not_found');
      if (o['id'] == mu['id']) throw ApiErr('forbidden');
      if (_rel(mu['id'], o['id']) != null) throw ApiErr('rel_exists');
      _r('rels').add({'a': mu['id'], 'b': o['id'], 'type': t, 'status': 'pending', 'created': _now()});
      _notify(o['id'], 'rel_req', mu['id'], null, extra: t);
      await _save();
      return {'ok': true};
    }
    if (p == '/me/relations' && m == 'GET') {
      final u = need();
      Map row(Map r) { final o = _byId(r['a'] == u['id'] ? r['b'] : r['a'])!; return {'username': o['username'], 'name': o['name'], 'avatar': _img(o, 'avatar'), 'type': r['type']}; }
      final mine = _r('rels').where((r) => r['a'] == u['id'] || r['b'] == u['id']).toList();
      return {
        'active': mine.where((r) => r['status'] == 'active').map((r) => row(r)).toList(),
        'incoming': mine.where((r) => r['status'] == 'pending' && r['b'] == u['id']).map((r) => row(r)).toList(),
        'outgoing': mine.where((r) => r['status'] == 'pending' && r['a'] == u['id']).map((r) => row(r)).toList(),
      };
    }
    x = RegExp(r'^/users/([a-z0-9_]+)/relations$').firstMatch(p);
    if (x != null && m == 'GET') {
      final o = _byName(x[1]!);
      if (o == null) throw ApiErr('not_found');
      final rows = _r('rels').where((r) => r['status'] == 'active' && (r['a'] == o['id'] || r['b'] == o['id'])).map((r) {
        final f = _byId(r['a'] == o['id'] ? r['b'] : r['a'])!;
        return {'username': f['username'], 'name': f['name'], 'avatar': _img(f, 'avatar'), 'type': r['type']};
      }).toList();
      return {'items': rows};
    }
    x = RegExp(r'^/relations/([a-z0-9_]+)(/accept|/decline)?$').firstMatch(p);
    if (x != null) {
      final mu = need(), o = _byName(x[1]!);
      if (o == null) throw ApiErr('not_found');
      final r = _rel(mu['id'], o['id']);
      if (r == null) throw ApiErr('not_found');
      if (x[2] == '/accept' && m == 'POST') {
        if (r['status'] != 'pending' || r['b'] != mu['id']) throw ApiErr('forbidden');
        r['status'] = 'active';
        r['since'] = _now();
        _r('notifs').removeWhere((n) => n['type'] == 'rel_req' && n['actor'] == o['id'] && n['to'] == mu['id']);
        _notify(o['id'], 'rel_ok', mu['id'], null, extra: '${r['type']}');
      } else if (x[2] == '/decline' && m == 'POST') {
        if (r['status'] != 'pending' || r['b'] != mu['id']) throw ApiErr('forbidden');
        _r('rels').remove(r);
        _r('notifs').removeWhere((n) => n['type'] == 'rel_req' && n['actor'] == o['id'] && n['to'] == mu['id']);
      } else if (x[2] == null && m == 'DELETE') {
        // Batalkan permintaan / putus hubungan (tanpa notifikasi ke pihak lain).
        _r('rels').remove(r);
        _r('notifs').removeWhere((n) => (n['type'] == 'rel_req' || n['type'] == 'rel_ok') && ((n['actor'] == o['id'] && n['to'] == mu['id']) || (n['actor'] == mu['id'] && n['to'] == o['id'])));
      } else {
        throw ApiErr('not_found');
      }
      await _save();
      return {'ok': true};
    }
    x = RegExp(r'^/users/([a-z0-9_]+)(/follow|/follows)?$').firstMatch(p);
    if (x != null) {
      final u = _byName(x[1]!);
      if (u == null) throw ApiErr('not_found');
      final id = u['id'] as int;
      if (x[2] == null && m == 'GET') {
        final mine = me != null && me['id'] == id;
        final locked = !mine && !_aud(u['pvis'] ?? 'public', u, me);
        final rows = locked ? [] : _r('audios').where((a) => a['owner'] == id).map((a) => _av(a, me)).toList();
        Map rel = {'status': 'none', 'type': ''};
        if (me != null && !mine) {
          final r = _rel(me['id'], id);
          if (r != null) rel = {'status': r['status'] == 'active' ? 'active' : (r['a'] == me['id'] ? 'out' : 'in'), 'type': r['type']};
        }
        return {'user': _uv(u, me), 'audios': rows, 'locked': locked, 'rel': rel};
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
    if (b.isEmpty) throw ApiErr('bad_file');
    if (b.length > 10 * 1024 * 1024) throw ApiErr('too_big_img');
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
    final ok = filters.where((e) => e != 'me').toList();
    final vis = 'public', rnd = f['rand'] == 'accounts' ? 'accounts' : (ok.contains(f['rand']) ? f['rand']! : 'public');
    final to = <int>[];
    if (rnd == 'accounts') {
      for (final n in (f['to'] ?? '').split(',')) {
        final o = _byName(n.trim().toLowerCase());
        if (o != null && o['id'] != me['id'] && !to.contains(o['id'])) to.add(o['id']);
      }
      if (to.isEmpty) throw ApiErr('need_accounts');
    }
    final id = _next();
    await _put('a$id', b);
    var d = (f['desc'] ?? '').trim();
    if (d.length > 200) d = d.substring(0, 200);
    _r('audios').insert(0, {'id': id, 'owner': me['id'], 'desc': d, 'secs': (int.tryParse(f['secs'] ?? '') ?? 30).clamp(1, 30), 'popup': true, 'pprof': f['pprof'] != '0', 'vis': vis, 'rand': rnd, 'to': to, 'created': _now()});
    await _save();
    return {'ok': true};
  }
}

class U {
  final String username, name, bio, birth, pvis;
  final String? avatar, cover;
  final int age, audios, streak, days, taps;
  int followers, following;
  bool isFollowing;
  final bool isMe;
  U.from(Map j)
      : username = j['username'], name = j['name'], bio = j['bio'] ?? '', birth = j['birth'] ?? '', avatar = j['avatar'], cover = j['cover'],
        pvis = j['pvis'] ?? 'public', streak = j['streak'] ?? 0, days = j['days'] ?? 0, taps = j['taps'] ?? 0,
        age = j['age'] ?? 0, audios = j['audios'] ?? 0, followers = j['followers'] ?? 0, following = j['following'] ?? 0,
        isFollowing = j['is_following'] == true, isMe = j['is_me'] == true;
}

class A {
  final int id, secs, created;
  final String desc, url, vis, rand, owner, ownerName;
  final String? ownerAvatar;
  final bool popup, pprof;
  int likes;
  bool liked;
  A.from(Map j)
      : id = j['id'], secs = j['secs'], created = j['created'] ?? 0, desc = j['desc'] ?? '', url = j['url'], vis = j['vis'] ?? 'public', rand = j['rand'] ?? 'public', owner = j['owner'],
        ownerName = j['owner_name'], ownerAvatar = j['owner_avatar'], popup = j['popup'] == true, pprof = j['pprof'] != false, likes = j['likes'] ?? 0, liked = j['liked'] == true;
  Map<String, dynamic> toJson() => {'id': id, 'secs': secs, 'created': created, 'desc': desc, 'url': url, 'vis': vis, 'rand': rand, 'owner': owner, 'owner_name': ownerName, 'owner_avatar': ownerAvatar, 'popup': popup, 'pprof': pprof, 'likes': likes, 'liked': liked};
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
  int taps = 0, unread = 0, unreadSocial = 0;
  String lang = 'id';
  ThemeMode mode = ThemeMode.system;
  bool remind = true, fromOffline = false;
  String filter = 'public';
  void Function(String)? banner; // pemberitahuan di dalam aplikasi (diisi dari main)
  final offline = <A>[];
  final _rnd = Random.secure();
  int? _lastOff;
  int _nid = 0;
  int? playing;
  int dur = 0;
  int _pushed = 0;
  Object? _scope;
  bool _starting = false;
  final pos = ValueNotifier<int>(0);
  final _p = AudioPlayer();
  late SharedPreferences _sp;

  String t(String k) => (S[k] ?? [k, k])[lang == 'id' ? 0 : 1];
  String err(Object e) => e is ApiErr ? (S.containsKey('e_${e.code}') ? t('e_${e.code}') : t('e_server')) : t('e_network');

  /// Waktu posting: "3 jam lalu" untuk 7 hari terakhir, selebihnya tanggal.
  String when(int ms) {
    if (ms <= 0) return '';
    final d = DateTime.fromMillisecondsSinceEpoch(ms);
    if (DateTime.now().difference(d).inDays < 7) return ago(ms);
    const m = {
      'id': ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'],
      'en': ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    };
    return '${d.day} ${m[lang]![d.month - 1]} ${d.year}';
  }

  String ago(int ms) {
    final m = (DateTime.now().millisecondsSinceEpoch - ms) ~/ 60000;
    if (m < 1) return t('ago_now');
    if (m < 60) return '$m ${t('ago_m')}';
    final h = m ~/ 60;
    return h < 24 ? '$h ${t('ago_h')}' : '${h ~/ 24} ${t('ago_d')}';
  }

  Future<void> init() async {
    _sp = await SharedPreferences.getInstance();
    lang = _sp.getString('lang') ?? 'id';
    mode = ThemeMode.values[(_sp.getInt('mode') ?? 0).clamp(0, 2)];
    remind = _sp.getBool('remind') ?? true;
    filter = _sp.getString('filter') ?? 'public';
    if (!Local.filters.contains(filter)) filter = 'public';
    await Local.init(_sp);
    Local.onNotify = (to, type, actor, extra) {
      if (me?.username == to) { banner?.call('$actor ${notifText(type, extra)}'); refresh(); }
      Notifier.show(200 + (_nid++ % 50), 'Hulhup', '$actor ${notifText(type, extra)} · @$to', t('notif'));
    };
    try { for (final j in jsonDecode(_sp.getString('offline') ?? '[]') as List) { offline.add(A.from(j as Map)); } } catch (_) {}
    _p.onPositionChanged.listen((d) => pos.value = d.inMilliseconds);
    _p.onDurationChanged.listen((d) => dur = d.inMilliseconds);
    _p.onPlayerComplete.listen((_) { playing = null; _scope = null; if (dur > 0) pos.value = dur; notifyListeners(); });
  }

  Future<void> refresh() async {
    try {
      if (Local.session != null) {
        final j = await Api.req('GET', '/me');
        me = U.from(j['user']);
        unread = j['unread'] ?? 0;
        unreadSocial = j['unread_social'] ?? 0;
      }
      taps = (await Api.req('GET', '/stats'))['taps'] ?? taps;
    } on ApiErr catch (e) {
      if (e.code == 'unauthorized') await _clear();
    }
    notifyListeners();
  }

  /// Dipanggil saat aplikasi dibuka / kembali ke depan: catat hari masuk, notifikasi, pengingat.
  /// Mengembalikan jumlah hari berturut-turut bila ini masuk pertama hari ini.
  Future<int?> start() async {
    if (_starting) return null;
    _starting = true;
    int? fresh;
    try {
      await refresh();
      if (me != null) {
        final j = await Api.req('POST', '/me/checkin');
        if (j['new'] == true) fresh = j['streak'] as int?;
        await Api.req('POST', '/me/reminders', body: {'on': remind});
        await refresh();
        if (unreadSocial > _pushed) {
          final msg = t('push_unread').replaceAll('{n}', '$unreadSocial');
          banner?.call(msg);
          await Notifier.show(1, 'Hulhup', msg, t('notif'));
        }
        _pushed = unreadSocial;
      }
    } catch (_) {
    } finally {
      _starting = false;
    }
    try {
      if (remind) {
        if (!await Notifier.enabled()) await Notifier.allow();
        await syncReminders();
      } else {
        await Notifier.cancelReminders();
      }
    } catch (_) {}
    return fresh;
  }

  /// Pengingat "Kamu lelah?" setiap hari jam 19.00, juga kalau aplikasi sudah dibuka hari itu. Dijadwal ulang tiap aplikasi dibuka.
  Future<void> syncReminders() async {
    await Notifier.cancelReminders();
    if (!remind) return;
    await Notifier.daily(101, 19, 0, t('r_title'), t('r_body'), t('notif'));
  }

  Future<void> setRemind(bool v) async {
    remind = v;
    await _sp.setBool('remind', v);
    notifyListeners();
    if (v) { await Notifier.allow(); await _sp.setBool('asked', true); await syncReminders(); } else { await Notifier.cancelReminders(); }
  }

  Future<void> _clear() async { await Local.setSession(null); me = null; unread = 0; unreadSocial = 0; _pushed = 0; }

  Future<void> auth(String path, Map body) async {
    final j = await Api.req('POST', path, body: body);
    me = U.from(j['user']);
    taps = me!.taps;
    notifyListeners();
    start();
  }

  Future<void> logout() async {
    try { await Api.req('POST', '/logout'); } catch (_) {}
    await _clear();
    await refresh();
  }

  Future<void> deleteAccount() async { await Api.req('DELETE', '/me'); await _clear(); await refresh(); }
  void setLang(String l) { lang = l; _sp.setString('lang', l); notifyListeners(); syncReminders(); }
  void setMode(ThemeMode m) { mode = m; _sp.setInt('mode', m.index); notifyListeners(); }

  /// Teks notifikasi sosial (suka, ikuti, hubungan).
  String notifText(String type, String extra) {
    switch (type) {
      case 'like': return t('n_like');
      case 'rel_req': return t('n_rel_req').replaceAll('{r}', t('a_$extra').toLowerCase());
      case 'rel_ok': return t('n_rel_ok').replaceAll('{r}', t('a_$extra').toLowerCase());
      default: return t('n_follow');
    }
  }

  Future<void> setFilter(String v) async {
    filter = v;
    await _sp.setString('filter', v);
    notifyListeners();
  }

  Future<void> setPvis(String v) async {
    final j = await Api.req('PATCH', '/me/settings', body: {'pvis': v});
    me = U.from(j['user']);
    notifyListeners();
  }

  Future<bool> _online() async {
    try { return (await Connectivity().checkConnectivity()).any((e) => e != ConnectivityResult.none); } catch (_) { return true; }
  }

  A? _pickOffline() {
    if (offline.isEmpty) return null;
    var c = offline;
    if (c.length > 1 && _lastOff != null) c = c.where((a) => a.id != _lastOff).toList();
    final a = c[_rnd.nextInt(c.length)];
    _lastOff = a.id;
    return a;
  }

  /// Tanpa internet, acak diambil dari audio yang sudah dijadikan offline.
  Future<A?> random() async {
    fromOffline = false;
    if (!await _online()) { fromOffline = true; return _pickOffline(); }
    try {
      final j = await Api.req('GET', '/random?f=${me == null ? 'public' : filter}');
      taps = j['taps'] ?? taps;
      notifyListeners();
      return j['audio'] == null ? null : A.from(j['audio']);
    } on ApiErr {
      rethrow;
    } catch (_) {
      fromOffline = true;
      return _pickOffline();
    }
  }

  bool isOffline(int id) => offline.any((o) => o.id == id);

  Future<void> toggleOffline(A a) async {
    final i = offline.indexWhere((o) => o.id == a.id);
    if (i >= 0) {
      await Local.delBlob('off${a.id}');
      offline.removeAt(i);
    } else {
      final b = Local.bytes(a.url);
      if (b == null) throw ApiErr('server');
      await Local.putBlob('off${a.id}', b);
      final j = a.toJson();
      j['url'] = 'mem:off${a.id}';
      offline.insert(0, A.from(j));
    }
    await _sp.setString('offline', jsonEncode(offline.map((o) => o.toJson()).toList()));
    notifyListeners();
  }

  /// [loop]: audio berulang terus sampai dijeda atau popup/halaman ditutup.
  /// [scope]: halaman yang memutar; saat halaman itu ditutup, panggil [leave] agar suara berhenti.
  Future<void> play(A a, {bool force = false, bool loop = true, Object? scope}) async {
    if (!force && playing == a.id) { await stop(); return; }
    playing = a.id;
    _scope = scope;
    pos.value = 0;
    dur = 0;
    notifyListeners();
    await _p.stop();
    await _p.setReleaseMode(loop ? ReleaseMode.loop : ReleaseMode.release);
    final b = Local.bytes(a.url);
    await _p.play(b != null ? BytesSource(b, mimeType: mimeOf(b)) : UrlSource(a.url));
  }

  Future<void> stop() async {
    await _p.stop();
    playing = null;
    _scope = null;
    pos.value = 0;
    notifyListeners();
  }

  /// Dipanggil dari dispose() halaman: hentikan suara bila diputar dari halaman itu.
  void leave(Object scope) {
    if (_scope == scope && playing != null) Future.microtask(stop);
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
  'search': ['Cari', 'Search'], 'notif': ['Notifikasi', 'Notifications'],
  'n_follow': ['mulai mengikutimu', 'started following you'],
  'remove_photo': ['Hapus foto profil', 'Remove profile photo'], 'remove_photo_q': ['Foto profil akan kembali ke bawaan.', 'Your profile photo will go back to the default.'], 'photo_removed': ['Foto profil dihapus', 'Profile photo removed'],
  'a_friend': ['Teman', 'Friends'], 'a_best': ['Sahabat', 'Best friends'], 'a_partner': ['Pasangan', 'Partner'], 'a_family': ['Keluarga', 'Family'],
  'a_relations': ['Semua hubungan', 'All relationships'], 'a_accounts': ['Pilih akun', 'Choose accounts'], 'f_me': ['Untuk saya', 'For me'],
  'filter_title': ['Filter suara acak', 'Random voice filter'], 'filter_sub': ['Tombol acak hanya memutar suara dari kelompok ini.', 'The random button only plays voices from this group.'],
  'nofilter': ['Belum ada suara untuk filter ini', 'No voices for this filter yet'], 'filter_login': ['Masuk dulu untuk memakai filter lain', 'Sign in to use other filters'],
  'locked': ['Postingan akun ini tidak dapat dilihat', 'This account\'s posts cannot be viewed'],
  'rel_title': ['Hubungan', 'Relationships'], 'rel_none': ['Belum ada hubungan', 'No relationships yet'], 'rel_add': ['Ajak berhubungan', 'Request relationship'],
  'rel_pick': ['Pilih jenis hubungan', 'Choose relationship type'], 'rel_wait': ['Menunggu persetujuan', 'Waiting for approval'], 'rel_cancel': ['Batalkan permintaan', 'Cancel request'],
  'rel_accept': ['Terima', 'Accept'], 'rel_decline': ['Tolak', 'Decline'], 'rel_end': ['Putus hubungan', 'End relationship'],
  'rel_end_q': ['Putus hubungan dengan {n}? Pihak lain tidak diberi tahu.', 'End the relationship with {n}? They will not be notified.'],
  'rel_sent': ['Permintaan terkirim', 'Request sent'], 'rel_ended': ['Hubungan berakhir', 'Relationship ended'], 'rel_made': ['Hubungan dibuat', 'Relationship created'],
  'rel_in': ['Permintaan masuk', 'Incoming requests'], 'rel_out': ['Permintaan terkirim', 'Sent requests'],
  'n_rel_req': ['mengajakmu berhubungan sebagai {r}', 'wants to be your {r}'], 'n_rel_ok': ['menerima hubungan {r} denganmu', 'accepted your {r} relationship'],
  'e_rel_exists': ['Sudah ada hubungan atau permintaan dengan akun ini', 'A relationship or request with this account already exists'],
  'e_need_accounts': ['Pilih minimal satu akun', 'Choose at least one account'],
  'pick_acc': ['Pilih akun', 'Choose accounts'], 'pick_acc_n': ['{n} akun dipilih', '{n} accounts chosen'], 'search_acc': ['Cari akun', 'Search accounts'], 'pick_acc_hint': ['Ketik nama untuk mencari akun', 'Type a name to find accounts'],
  'test_notif': ['Tes notifikasi', 'Test notification'], 'test_notif_sub': ['Kirim notifikasi percobaan ke HP ini', 'Send a test notification to this phone'],
  'notif_off': ['Notifikasi dimatikan di HP. Aktifkan lewat pengaturan aplikasi.', 'Notifications are off on this phone. Turn them on in app settings.'], 'test_sent': ['Notifikasi percobaan dikirim', 'Test notification sent'], 'n_like': ['menyukai audiomu', 'liked your audio'],
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
  'e_forbidden': ['Tindakan ini tidak diizinkan', 'This action is not allowed'],
  'a_me': ['Hanya untuk saya', 'Only me'], 'pvis': ['Siapa yang bisa melihat audioku di profil', 'Who can see my audio on my profile'],
  'remind': ['Pengingat harian', 'Daily reminder'], 'remind_sub': ['Notifikasi “Kamu lelah?” setiap hari jam 19.00', 'A “Feeling tired?” notification every day at 7 PM'],
  'streak_t': ['{n} hari berturut-turut', '{n}-day streak'], 'days_total': ['Total masuk {n} hari', '{n} days signed in in total'],
  'view_photo': ['Lihat foto', 'View photo'], 'change_photo': ['Ganti foto', 'Change photo'],
  'search_hint': ['Cari akun atau audio', 'Search accounts or audio'], 'sec_acc': ['Akun', 'Accounts'], 'sec_audio': ['Audio', 'Audio'],
  'n_streak': ['Kamu sudah masuk {n} hari berturut-turut', 'You’ve signed in {n} days in a row'],
  'n_missed': ['Kamu tidak masuk {n} hari. Rangkaianmu dimulai lagi dari awal.', 'You missed {n} day(s). Your streak starts over.'],
  'push_unread': ['{n} notifikasi baru', '{n} new notifications'],
  'r_title': ['Kamu lelah?', 'Feeling tired?'], 'r_body': ['Coba lah untuk mendengarkan beberapa suara', 'Try listening to a few voices'],
  'mk_offline': ['Jadikan offline', 'Make available offline'], 'is_offline': ['Tersimpan offline', 'Saved offline'], 'offline_t': ['Audio offline', 'Offline audio'],
  'saved_off': ['Disimpan untuk offline', 'Saved for offline'], 'removed_off': ['Dihapus dari offline', 'Removed from offline'], 'off_fail': ['Tidak bisa menyimpan audio ini', 'Couldn’t save this audio'],
  'empty_offline': ['Belum ada audio offline. Simpan lewat popup acak atau daftar audio.', 'No offline audio yet. Save from the random popup or an audio list.'],
  'no_net': ['Tidak ada internet. Memutar audio offline.', 'No internet. Playing offline audio.'], 'no_net_empty': ['Tidak ada internet dan belum ada audio offline.', 'No internet and no offline audio yet.'],
  'e_storage_full': ['Penyimpanan penuh. Hapus beberapa audio atau foto dulu.', 'Storage is full. Delete some audio or photos first.'],
  'remove_follower': ['Hapus pengikut', 'Remove follower'], 'remove': ['Hapus', 'Remove'], 'follower_removed': ['Pengikut dihapus', 'Follower removed'],
  'remove_follower_q': ['{name} tidak akan mengikutimu lagi. Dia tidak diberi tahu.', '{name} will no longer follow you. They won’t be notified.'],
  'streak_cal': ['Hari masuk', 'Sign-in days'], 'cal_in': ['Masuk', 'Signed in'], 'cal_miss': ['Tidak masuk', 'Missed'], 'cal_today': ['Hari ini', 'Today'],
  'cal_month': ['Bulan ini: {a} hari masuk, {b} hari tidak masuk', 'This month: {a} days signed in, {b} missed'],
  'cal_missed_list': ['Hari yang tidak masuk', 'Days you missed'], 'cal_none': ['Tidak ada hari yang terlewat', 'No missed days'],
  'cal_note': ['Riwayat sebelum fitur ini hanya tercatat dari rangkaian terakhir.', 'History before this feature is only known from your latest streak.'],
  'ago_now': ['baru saja', 'just now'], 'ago_m': ['mnt lalu', 'min ago'], 'ago_h': ['jam lalu', 'h ago'], 'ago_d': ['hari lalu', 'd ago'],
  'e_too_big_img': ['Foto terlalu besar (maks 10 MB)', 'Photo too large (max 10 MB)'],
  'about_t': [
    'Hulhup adalah ruang suara yang sederhana. Ketuk satu tombol, dengarkan suara acak dari orang-orang di seluruh dunia, tanpa perlu masuk.\n\nMasuk hanya jika kamu ingin berbagi suaramu sendiri, menyukai audio, mengikuti akun lain, dan mencari audio lewat deskripsinya.\n\nKamu mengatur sendiri siapa yang bisa mendengar audiomu secara acak, dan lewat Pengaturan siapa yang bisa melihatnya di profilmu, termasuk pilihan hanya untuk saya.\n\nHulhup mengingatkanmu lewat notifikasi dan menghitung berapa hari berturut-turut kamu masuk.\n\nHulhup adalah produk dari Misyi.\n\nVersi 1.1.0',
    'Hulhup is a simple home for voices. Tap one button and hear a random voice from people around the world, no sign-in needed.\n\nSign in only if you want to share your own voice, like audio, follow other accounts, and search audio by its description.\n\nYou choose who can hear your audio randomly, and in Settings who can see it on your profile, including an only-me option.\n\nHulhup reminds you with notifications and counts how many days in a row you sign in.\n\nHulhup is a product of Misyi.\n\nVersion 1.1.0'],
  'policy_t': [
    'Dengan memakai Hulhup kamu setuju pada aturan berikut.\n\n1. Audio yang kamu unggah berdurasi maksimal 30 detik, dengan deskripsi maksimal 200 karakter, dan harus milikmu atau kamu punya izin memakainya. Foto profil maksimal 10 MB.\n2. Dilarang mengunggah konten yang melecehkan, menebar kebencian, mengandung kekerasan atau seksual, melanggar hukum, atau meniru orang lain.\n3. Dilarang spam dan menyalahgunakan layanan.\n4. Untuk setiap audio kamu memilih siapa yang bisa mendengarnya secara acak: publik, pengikut, mengikuti, atau pengikut dan mengikuti. Audio publik dapat didengar siapa saja.\n5. Di Pengaturan kamu memilih siapa yang bisa melihat audiomu di profil dan di hasil pencarian: publik, pengikut, mengikuti, pengikut dan mengikuti, atau hanya untuk saya. Pilihan hanya untuk saya hanya berlaku untuk tampilan profil dan tidak memengaruhi pilihan acak.\n6. Audio tidak bisa diedit, hanya dihapus. Kamu bebas menghapus audio atau akunmu kapan saja.\n7. Kami dapat menghapus konten atau akun yang melanggar aturan ini.\n8. Hulhup disediakan apa adanya, aturan dapat diperbarui dan versi terbaru selalu ada di halaman ini.',
    'By using Hulhup you agree to the following.\n\n1. Audio you upload is at most 30 seconds, with a description of at most 200 characters, and must be yours or you must have permission to use it. Profile photos are at most 10 MB.\n2. Do not upload content that harasses, spreads hate, contains violence or sexual material, breaks the law, or impersonates others.\n3. No spam or misuse of the service.\n4. For each audio you choose who can hear it randomly: public, followers, following, or followers and following. Public audio can be heard by anyone.\n5. In Settings you choose who can see your audio on your profile and in search results: public, followers, following, followers and following, or only me. Only me applies to the profile view only and does not affect the random setting.\n6. Audio cannot be edited, only deleted. You may delete audio or your account at any time.\n7. We may remove content or accounts that break these rules.\n8. Hulhup is provided as is. These rules may be updated and the latest version is always on this page.'],
  'privacy_t': [
    'Data yang kami simpan: nama, nama pengguna, tanggal lahir, bio, foto profil, audio yang kamu unggah, suka, pengikut, serta jumlah hari kamu masuk. Tanggal lahir dan usiamu tidak ditampilkan ke pengguna lain.\n\nKata sandi disimpan dalam bentuk hash, tidak pernah dalam bentuk asli.\n\nNotifikasi: Hulhup meminta izin notifikasi untuk mengirim pengingat harian setiap jam 19.00, dan pemberitahuan suka dan pengikut baru. Pengingat dijadwalkan di perangkatmu sendiri. Kamu bisa mematikannya di Pengaturan atau di pengaturan sistem perangkat.\n\nMikrofon hanya dipakai saat kamu menekan tombol rekam. Galeri hanya dibuka saat kamu memilih foto.\n\nTanpa login, kamu hanya mendengar suara; kami tidak membuat profil tamu.\n\nAudio yang kamu jadikan offline disalin dan disimpan di perangkatmu supaya bisa diputar tanpa internet. Kamu bisa menghapusnya kapan saja dari menu Audio offline.\n\nKami tidak menjual datamu dan tidak menampilkan iklan. Untuk saat ini data hanya disimpan di perangkatmu.\n\nMenghapus audio atau akun akan menghapus file dan datanya secara permanen dari perangkat.',
    'Data we store: name, username, date of birth, bio, profile photo, audio you upload, likes, followers, and the number of days you signed in. Your date of birth and age are never shown to other users.\n\nPasswords are stored as hashes, never in plain form.\n\nNotifications: Hulhup asks for notification permission to send a daily reminder every day at 7 PM, and alerts for new likes and followers. Reminders are scheduled on your own device. You can turn them off in Settings or in your device settings.\n\nThe microphone is used only when you press record. The gallery opens only when you pick a photo.\n\nWithout signing in you only listen; we do not create guest profiles.\n\nAudio you make available offline is copied and stored on your device so it can play without internet. You can remove it anytime from the Offline audio menu.\n\nWe do not sell your data and show no ads. For now data is stored only on your device.\n\nDeleting audio or your account permanently removes the files and data from the device.'],
};
