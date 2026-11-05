import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:hulhup/core.dart';
import 'package:shared_preferences/shared_preferences.dart';

Future<void> fresh() async {
  SharedPreferences.setMockInitialValues({});
  await Local.init(await SharedPreferences.getInstance());
  await Local.setSession(null);
}

Future<dynamic> reg(String u, {String pw = 'secret1', String birth = '2000-01-01'}) =>
    Api.req('POST', '/register', body: {'name': 'Nama $u', 'username': u, 'password': pw, 'birth': birth});

Future<void> up(String desc, {String rand = 'public', int bytes = 100}) =>
    Api.multi('/audios', Uint8List.fromList(List.filled(bytes, 1)), 'a.m4a', {'desc': desc, 'secs': '3', 'rand': rand, 'pprof': '1'});

String iso(DateTime d) => '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

Future<String?> code(Future<dynamic> f) async {
  try { await f; return null; } on ApiErr catch (e) { return e.code; }
}

Map userRow(String name) => (Local.db['users'] as List).firstWhere((u) => u['username'] == name);

void main() {
  setUp(fresh);

  test('daftar, masuk, nama pengguna unik, validasi', () async {
    await reg('rani');
    expect(await code(reg('rani')), 'username_taken');
    expect(await code(reg('Ra')), 'bad_username');
    expect(await code(reg('budi', pw: '123')), 'bad_password');
    expect(await code(reg('budi', birth: '2999-01-01')), 'bad_age');
    expect(await code(reg('budi', birth: 'bukan')), 'bad_age');
    await Api.req('POST', '/logout');
    expect(await code(Api.req('POST', '/login', body: {'username': 'rani', 'password': 'salah'})), 'bad_credentials');
    await Api.req('POST', '/login', body: {'username': 'RANI', 'password': 'secret1'});
    expect(Local.session, 'rani');
  });

  test('angka tap per akun, akun baru mulai dari 0, tamu terpisah', () async {
    await up('x').catchError((_) {}); // tamu tidak boleh unggah
    await Api.req('GET', '/random');
    await Api.req('GET', '/random');
    expect((await Api.req('GET', '/stats'))['taps'], 2); // hitungan tamu
    await reg('ana');
    expect((await Api.req('GET', '/stats'))['taps'], 0);
    await Api.req('GET', '/random');
    expect((await Api.req('GET', '/stats'))['taps'], 1);
    await Api.req('POST', '/logout');
    expect((await Api.req('GET', '/stats'))['taps'], 2);
    await reg('bob');
    expect((await Api.req('GET', '/stats'))['taps'], 0);
  });

  test('acak: hanya pengikut, pemilik tidak mendengar sendiri, publik untuk semua', () async {
    await reg('ana');
    await up('hanya pengikut', rand: 'followers');
    expect((await Api.req('GET', '/random?f=followers'))['audio'], isNull); // pemilik bukan pengikutnya sendiri
    await Api.req('POST', '/logout');
    await reg('bob');
    expect((await Api.req('GET', '/random?f=followers'))['audio'], isNull); // b belum mengikuti a
    await Api.req('POST', '/users/ana/follow');
    expect((await Api.req('GET', '/random?f=followers'))['audio']['desc'], 'hanya pengikut');
    expect((await Api.req('GET', '/random'))['audio'], isNull); // filter publik tidak memuat audio pengikut
    await Api.req('POST', '/logout');
    expect((await Api.req('GET', '/random?f=followers'))['audio'], isNull); // tamu
  });

  test('acak: mengikuti, dan tidak mengulang berturut-turut', () async {
    await reg('ana');
    await up('satu');
    await up('dua');
    String? last;
    for (var i = 0; i < 60; i++) {
      final d = (await Api.req('GET', '/random'))['audio']['desc'] as String;
      expect(d, isNot(last));
      last = d;
    }
    await Api.req('POST', '/logout');
    await reg('bob');
    await up('khusus', rand: 'following'); // hanya didengar orang yang diikuti b
    Future<Set<String>> draw(String u) async {
      await Api.req('POST', '/logout');
      await Api.req('POST', '/login', body: {'username': u, 'password': 'secret1'});
      final seen = <String>{};
      for (var i = 0; i < 80; i++) { final a = (await Api.req('GET', '/random?f=following'))['audio']; if (a != null) seen.add(a['desc']); }
      return seen;
    }
    expect((await draw('ana')).contains('khusus'), isFalse); // b belum mengikuti a
    await Api.req('POST', '/logout');
    await Api.req('POST', '/login', body: {'username': 'bob', 'password': 'secret1'});
    await Api.req('POST', '/users/ana/follow');
    expect((await draw('ana')).contains('khusus'), isTrue); // sekarang a diikuti b
    expect((await draw('bob')).contains('khusus'), isFalse); // pemilik tidak mendengar audionya sendiri
  });

  test('siapa yang melihat di profil: hanya untuk saya, pengikut', () async {
    await reg('ana');
    await up('rahasia');
    await Api.req('POST', '/logout');
    await reg('bob');
    expect(((await Api.req('GET', '/users/ana'))['audios'] as List).length, 1);
    await Api.req('POST', '/logout');
    await Api.req('POST', '/login', body: {'username': 'ana', 'password': 'secret1'});
    await Api.req('PATCH', '/me/settings', body: {'pvis': 'me'});
    expect(((await Api.req('GET', '/users/ana'))['audios'] as List).length, 1); // pemilik tetap melihat
    await Api.req('POST', '/logout');
    expect(((await Api.req('GET', '/users/ana'))['audios'] as List).length, 0);
    expect(((await Api.req('GET', '/search?q=rahasia'))['audios'] as List).length, 0);
    await Api.req('POST', '/login', body: {'username': 'ana', 'password': 'secret1'});
    await Api.req('PATCH', '/me/settings', body: {'pvis': 'followers'});
    await Api.req('POST', '/logout');
    await reg('cici');
    expect(((await Api.req('GET', '/users/ana'))['audios'] as List).length, 0);
    await Api.req('POST', '/users/ana/follow');
    expect(((await Api.req('GET', '/users/ana'))['audios'] as List).length, 1);
    expect(code(Api.req('PATCH', '/me/settings', body: {'pvis': 'aneh'})), completion('bad_file'));
    // "hanya untuk saya" tidak memengaruhi acak
    await Api.req('POST', '/logout');
    await Api.req('POST', '/login', body: {'username': 'ana', 'password': 'secret1'});
    await Api.req('PATCH', '/me/settings', body: {'pvis': 'me'});
    await Api.req('POST', '/logout');
    expect((await Api.req('GET', '/random'))['audio']['desc'], 'rahasia');
    await Api.req('POST', '/login', body: {'username': 'cici', 'password': 'secret1'});
    final lk = await Api.req('GET', '/users/ana');
    expect(lk['locked'], isTrue); // profil terkunci untuk akun lain
    expect(lk['audios'], isEmpty);
  });

  test('cari audio lewat deskripsi, deskripsi dipotong 200 karakter', () async {
    await reg('ana');
    await up('Suara ombak pantai');
    await up('x' * 300);
    final r = await Api.req('GET', '/search?q=OMBAK');
    expect((r['audios'] as List).length, 1);
    final all = (await Api.req('GET', '/users/ana'))['audios'] as List;
    expect(all.map((e) => (e['desc'] as String).length).toList()..sort(), [18, 200]);
    expect(all.every((e) => e['popup'] == true), isTrue);
  });

  test('suka dan ikuti: notifikasi tidak ganda, hapus pengikut', () async {
    await reg('ana');
    await up('lagu');
    await Api.req('POST', '/logout');
    await reg('bob');
    final id = ((await Api.req('GET', '/users/ana'))['audios'] as List).first['id'];
    final pushed = <String>[];
    Local.onNotify = (to, type, actor, extra) => pushed.add('$to:$type:$actor');
    await Api.req('POST', '/audios/$id/like');
    await Api.req('POST', '/audios/$id/like'); // batal suka
    await Api.req('POST', '/audios/$id/like'); // suka lagi: tidak ada notifikasi ganda
    await Api.req('POST', '/users/ana/follow');
    await Api.req('POST', '/users/ana/follow');
    await Api.req('POST', '/users/ana/follow');
    expect(pushed, ['ana:like:Nama bob', 'ana:follow:Nama bob']);
    await Api.req('POST', '/logout');
    await Api.req('POST', '/login', body: {'username': 'ana', 'password': 'secret1'});
    expect((await Api.req('GET', '/me'))['unread_social'], 2);
    expect(((await Api.req('GET', '/notifications'))['items'] as List).length, 2);
    expect((await Api.req('GET', '/users/ana'))['user']['followers'], 1);
    await Api.req('DELETE', '/me/followers/bob');
    expect((await Api.req('GET', '/users/ana'))['user']['followers'], 0);
    expect(((await Api.req('GET', '/notifications'))['items'] as List).where((e) => e['type'] == 'follow').length, 0);
    expect(await code(Api.req('DELETE', '/me/followers/tidakada')), 'not_found');
  });

  test('hari masuk: rangkaian, riwayat, hari terlewat, pengingat 19.00', () async {
    await reg('ana');
    var c = await Api.req('POST', '/me/checkin');
    expect([c['new'], c['streak']], [true, 1]);
    c = await Api.req('POST', '/me/checkin');
    expect([c['new'], c['streak']], [false, 1]);
    final today = DateTime.now();
    expect((await Api.req('GET', '/me/log'))['days'], [iso(today)]);
    // kemarin masuk -> rangkaian lanjut
    var u = userRow('ana');
    u['last'] = iso(DateTime(today.year, today.month, today.day - 1)); u['streak'] = 4; u['log'] = [u['last']];
    c = await Api.req('POST', '/me/checkin');
    expect(c['streak'], 5);
    // 4 hari tidak masuk -> terlewat 3 hari, rangkaian ulang
    u = userRow('ana');
    u['last'] = iso(DateTime(today.year, today.month, today.day - 4)); u['streak'] = 9;
    c = await Api.req('POST', '/me/checkin');
    expect(c['streak'], 1);
    final n = (await Api.req('GET', '/notifications'))['items'] as List;
    expect(n.where((e) => e['type'] == 'missed' && e['n'] == 3).length, 1);
    // pengingat: tidak ada yang lama; setelah slot berganti muncul satu "tired"
    var r = await Api.req('POST', '/me/reminders', body: {'on': true});
    expect(r['added'], false);
    userRow('ana')['rem'] = '2000-01-01';
    r = await Api.req('POST', '/me/reminders', body: {'on': true});
    expect(r['added'], true);
    r = await Api.req('POST', '/me/reminders', body: {'on': true});
    expect(r['added'], false);
    userRow('ana')['rem'] = '2000-01-01';
    r = await Api.req('POST', '/me/reminders', body: {'on': false});
    expect(r['added'], false);
  });

  test('foto profil maksimal 3 MB, audio maksimal 3 MB', () async {
    await reg('ana');
    await Api.raw('/me/avatar', Uint8List(2 * 1024 * 1024), 'image/jpeg');
    expect(await code(Api.raw('/me/avatar', Uint8List(4 * 1024 * 1024), 'image/png')), 'too_big_img');
    expect(await code(Api.raw('/me/avatar', Uint8List(10), 'image/gif')), 'bad_file');
    expect(await code(up('besar', bytes: 4 * 1024 * 1024)), 'too_big');
  });

  test('hapus akun membersihkan semuanya', () async {
    await reg('ana');
    await up('lagu');
    await Api.req('POST', '/logout');
    await reg('bob');
    final id = ((await Api.req('GET', '/users/ana'))['audios'] as List).first['id'];
    await Api.req('POST', '/audios/$id/like');
    await Api.req('POST', '/users/ana/follow');
    await Api.req('POST', '/logout');
    await Api.req('POST', '/login', body: {'username': 'ana', 'password': 'secret1'});
    await Api.req('DELETE', '/me');
    expect(Local.session, isNull);
    expect((Local.db['audios'] as List), isEmpty);
    expect((Local.db['likes'] as List), isEmpty);
    expect((Local.db['follows'] as List), isEmpty);
    expect(await code(Api.req('GET', '/users/ana')), 'not_found');
    expect((await Api.req('GET', '/random'))['audio'], isNull);
  });

  Future<void> login(String u) async {
    await Api.req('POST', '/logout');
    await Api.req('POST', '/login', body: {'username': u, 'password': 'secret1'});
  }

  Future<List<String>> drawAll(String f) async {
    final seen = <String>{};
    for (var i = 0; i < 40; i++) {
      final a = (await Api.req('GET', '/random?f=$f'))['audio'];
      if (a != null) seen.add(a['desc']);
    }
    return seen.toList()..sort();
  }

  test('hubungan perlu persetujuan dua pihak, bisa ditolak dan diputus', () async {
    await reg('ana');
    await reg('bob');
    await Api.req('POST', '/logout');
    await login('ana');
    await Api.req('POST', '/relations', body: {'to': 'bob', 'type': 'friend'});
    expect(await code(Api.req('POST', '/relations', body: {'to': 'bob', 'type': 'family'})), 'rel_exists');
    expect(await code(Api.req('POST', '/relations', body: {'to': 'ana', 'type': 'friend'})), 'forbidden');
    expect(await code(Api.req('POST', '/relations', body: {'to': 'bob', 'type': 'musuh'})), 'bad_file');
    expect((await Api.req('GET', '/users/bob'))['rel']['status'], 'out');
    expect(((await Api.req('GET', '/users/bob/relations'))['items'] as List), isEmpty); // belum disetujui
    expect(await code(Api.req('POST', '/relations/bob/accept')), 'forbidden'); // pengaju tidak bisa menyetujui sendiri
    await login('bob');
    expect((await Api.req('GET', '/users/ana'))['rel'], {'status': 'in', 'type': 'friend'});
    final n = (await Api.req('GET', '/notifications'))['items'] as List;
    expect(n.first['type'], 'rel_req');
    expect(n.first['extra'], 'friend');
    await Api.req('POST', '/relations/ana/decline');
    expect((await Api.req('GET', '/users/ana'))['rel']['status'], 'none');
    // ajukan lagi, disetujui
    await Api.req('POST', '/relations', body: {'to': 'ana', 'type': 'best'});
    await login('ana');
    await Api.req('POST', '/relations/bob/accept');
    expect((await Api.req('GET', '/users/bob'))['rel'], {'status': 'active', 'type': 'best'});
    await Api.req('POST', '/logout');
    final pub = (await Api.req('GET', '/users/ana/relations'))['items'] as List; // siapa pun bisa melihat
    expect(pub.single['username'], 'bob');
    expect(pub.single['type'], 'best');
    await login('bob');
    expect((await Api.req('GET', '/notifications'))['items'].any((e) => e['type'] == 'rel_ok'), isTrue);
    await Api.req('DELETE', '/relations/ana'); // putus hubungan
    expect(((await Api.req('GET', '/me/relations'))['active'] as List), isEmpty);
    expect(((await Api.req('GET', '/users/ana/relations'))['items'] as List), isEmpty);
  });

  test('filter acak ketat per audiens: teman, sahabat, pasangan, keluarga, semua hubungan', () async {
    await reg('ana');
    for (final r in ['public', 'friend', 'best', 'partner', 'family', 'relations']) { await up(r, rand: r); }
    await reg('bob');
    await Api.req('POST', '/logout');
    await login('bob');
    expect(await drawAll('public'), ['public']);
    expect(await drawAll('friend'), isEmpty); // belum berhubungan
    expect(await drawAll('relations'), isEmpty);
    await Api.req('POST', '/relations', body: {'to': 'ana', 'type': 'friend'});
    expect(await drawAll('friend'), isEmpty); // belum disetujui
    await login('ana');
    await Api.req('POST', '/relations/bob/accept');
    await login('bob');
    expect(await drawAll('friend'), ['friend']);
    expect(await drawAll('best'), isEmpty);
    expect(await drawAll('relations'), ['relations']); // semua hubungan: hanya audio berlabel itu
    expect(await drawAll('public'), ['public']);
    await Api.req('DELETE', '/relations/ana');
    expect(await drawAll('friend'), isEmpty);
    expect(await drawAll('ngawur'), ['public']); // filter tak dikenal jatuh ke publik
  });

  test('pilih akun: muncul di "untuk saya" hanya untuk akun terpilih', () async {
    await reg('ana');
    await reg('bob');
    await reg('cici');
    await Api.req('POST', '/logout');
    await login('ana');
    expect(await code(Api.multi('/audios', Uint8List.fromList(List.filled(50, 1)), 'a.m4a', {'desc': 'x', 'secs': '3', 'rand': 'accounts', 'to': ''})), 'need_accounts');
    expect(await code(Api.multi('/audios', Uint8List.fromList(List.filled(50, 1)), 'a.m4a', {'desc': 'x', 'secs': '3', 'rand': 'accounts', 'to': 'ana,tidakada'})), 'need_accounts');
    expect((Local.db['audios'] as List), isEmpty); // gagal tidak meninggalkan data
    await Api.multi('/audios', Uint8List.fromList(List.filled(50, 1)), 'a.m4a', {'desc': 'rahasia bob', 'secs': '3', 'rand': 'accounts', 'to': 'bob'});
    expect(await drawAll('me'), isEmpty); // pengirim tidak menerima sendiri
    await login('bob');
    expect(await drawAll('me'), ['rahasia bob']);
    expect(await drawAll('public'), isEmpty);
    await login('cici');
    expect(await drawAll('me'), isEmpty);
    await Api.req('POST', '/logout');
    expect(await drawAll('me'), isEmpty);
  });

  test('profil: semua daftar baru dipakai, hapus akun membersihkan hubungan', () async {
    await reg('ana');
    await reg('bob');
    await Api.req('POST', '/logout');
    await login('ana');
    for (final v in ['public', 'followers', 'following', 'both', 'friend', 'best', 'partner', 'family', 'relations', 'me']) {
      await Api.req('PATCH', '/me/settings', body: {'pvis': v});
    }
    expect(await code(Api.req('PATCH', '/me/settings', body: {'pvis': 'accounts'})), 'bad_file');
    await Api.req('PATCH', '/me/settings', body: {'pvis': 'family'});
    await up('keluarga saja');
    await login('bob');
    expect((await Api.req('GET', '/users/ana'))['locked'], isTrue);
    await Api.req('POST', '/relations', body: {'to': 'ana', 'type': 'family'});
    await login('ana');
    await Api.req('POST', '/relations/bob/accept');
    await login('bob');
    final j = await Api.req('GET', '/users/ana');
    expect(j['locked'], isFalse);
    expect((j['audios'] as List).length, 1);
    await Api.req('DELETE', '/me');
    expect((Local.db['rels'] as List), isEmpty);
  });

  test('hapus foto profil kembali ke bawaan', () async {
    await reg('ana');
    await Api.raw('/me/avatar', Uint8List.fromList(List.filled(20, 1)), 'image/png');
    expect((await Api.req('GET', '/me'))['user']['avatar'], isNotNull);
    await Api.req('DELETE', '/me/avatar');
    expect((await Api.req('GET', '/me'))['user']['avatar'], isNull);
    expect(Local.bytes('mem:u1_avatar'), isNull);
  });
}
