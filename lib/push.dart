import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'core.dart';

/// Notifikasi dorong lewat Firebase: sampai walau aplikasi ditutup. Konfigurasi di bawah bersifat publik (bukan rahasia).
class Push {
  static const _opt = FirebaseOptions(
    apiKey: 'AIzaSyCFtErbdLWkTwKIc3ADcRr27uTHFCYueCw',
    appId: '1:555376760197:android:62421257c7742de9a7a0ec',
    messagingSenderId: '555376760197',
    projectId: 'hulhup',
    storageBucket: 'hulhup.firebasestorage.app',
  );
  static bool _ready = false, _hooked = false;
  static String? _token;

  static bool get supported => !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  static Future<bool> _init() async {
    if (!supported) return false;
    if (_ready) return true;
    try {
      await Firebase.initializeApp(options: _opt);
      _ready = true;
    } catch (_) {}
    return _ready;
  }

  /// Daftarkan HP ini ke server. true bila berhasil (maka pengecekan berkala tidak perlu).
  static Future<bool> register(String lang) async {
    try {
      if (!await _init()) return false;
      final m = FirebaseMessaging.instance;
      final p = await m.requestPermission();
      if (p.authorizationStatus == AuthorizationStatus.denied) return false;
      final t = await m.getToken();
      if (t == null || t.isEmpty) return false;
      _token = t;
      await Api.req('POST', '/me/push', body: {'token': t, 'lang': lang});
      if (!_hooked) {
        _hooked = true;
        m.onTokenRefresh.listen((n) async {
          _token = n;
          try { await Api.req('POST', '/me/push', body: {'token': n, 'lang': Store.i.lang}); } catch (_) {}
        });
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  /// Lepas HP ini dari akun (saat keluar).
  static Future<void> unregister() async {
    try {
      final t = _token;
      if (t != null) await Api.req('POST', '/me/push', body: {'token': t, 'on': false});
    } catch (_) {}
  }
}
