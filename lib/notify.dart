import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:timezone/data/latest.dart' as tzdata;
import 'package:workmanager/workmanager.dart';
import 'package:timezone/timezone.dart' as tz;

/// Tugas latar belakang (jalan walau aplikasi ditutup, sekitar tiap 15 menit): cek notifikasi baru lalu tampilkan di HP.
@pragma('vm:entry-point')
void bgDispatcher() {
  Workmanager().executeTask((task, input) async {
    try { await bgCheck(); } catch (_) {}
    return true;
  });
}

Future<void> bgCheck() async {
  WidgetsFlutterBinding.ensureInitialized();
  const base = String.fromEnvironment('API_URL');
  if (base.isEmpty) return;
  final sp = await SharedPreferences.getInstance();
  await sp.reload();
  final tok = sp.getString('token');
  if (tok == null) return;
  final r = await http.get(Uri.parse('$base/me'), headers: {'Authorization': 'Bearer $tok'}).timeout(const Duration(seconds: 25));
  if (r.statusCode != 200) return;
  final n = ((jsonDecode(r.body) as Map)['unread_social'] ?? 0) as int;
  final last = sp.getInt('pushed') ?? 0;
  if (n > last) {
    final en = sp.getString('lang') == 'en';
    await Notifier.init();
    await Notifier.show(1, 'Hulhup', en ? 'You have $n new notifications' : 'Kamu punya $n notifikasi baru', en ? 'Notification' : 'Notifikasi');
  }
  await sp.setInt('pushed', n);
}

/// Notifikasi di HP (Android/iOS). Di web tidak aktif; semuanya aman dipanggil tanpa efek.
/// Ikon kecil = logo Hulhup putih (ic_stat_hulhup), ikon besar = logo Hulhup (hulhup_large).
class Notifier {
  static final _n = FlutterLocalNotificationsPlugin();
  static bool _ok = false;
  static String lastError = '';

  static Future<void> init() async {
    if (kIsWeb || _ok) return;
    try {
      tzdata.initializeTimeZones();
      const s = InitializationSettings(
        android: AndroidInitializationSettings('ic_stat_hulhup'),
        iOS: DarwinInitializationSettings(requestAlertPermission: false, requestBadgePermission: false, requestSoundPermission: false),
      );
      await _n.initialize(s);
      _ok = true;
      try {
        await _n.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()?.createNotificationChannel(const AndroidNotificationChannel('hulhup_main', 'Notifikasi Hulhup', description: 'Pengingat dan notifikasi dari Hulhup', importance: Importance.high));
      } catch (_) {}
      try { await Workmanager().initialize(bgDispatcher); } catch (_) {}
    } catch (e) { lastError = 'init: $e'; }
  }

  /// Apakah notifikasi sudah diizinkan di HP.
  static Future<bool> enabled() async {
    if (!_ok) return false;
    try {
      final a = _n.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
      if (a != null) return (await a.areNotificationsEnabled()) ?? true;
    } catch (e) { lastError = 'enabled: $e'; }
    return true;
  }

  /// Minta izin notifikasi (Android 13+ / iOS). Aman dipanggil berulang.
  static Future<bool> allow() async {
    if (!_ok) return false;
    try {
      final a = _n.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
      if (a != null) return (await a.requestNotificationsPermission()) ?? true;
      final i = _n.resolvePlatformSpecificImplementation<IOSFlutterLocalNotificationsPlugin>();
      if (i != null) return (await i.requestPermissions(alert: true, badge: true, sound: true)) ?? false;
    } catch (e) { lastError = 'allow: $e'; }
    return false;
  }

  static NotificationDetails _d(String sub) => NotificationDetails(
        android: AndroidNotificationDetails(
          'hulhup_main', 'Notifikasi Hulhup',
          channelDescription: 'Pengingat dan notifikasi dari Hulhup',
          importance: Importance.high, priority: Priority.high,
          icon: 'ic_stat_hulhup', largeIcon: const DrawableResourceAndroidBitmap('hulhup_large'),
          color: const Color(0xFF163F2B), subText: sub,
        ),
        iOS: const DarwinNotificationDetails(),
      );

  static Future<void> show(int id, String title, String body, String sub) async {
    if (!_ok) return;
    try {
      if (!await enabled()) await allow();
      await _n.show(id, title, body, _d(sub));
    } catch (e) { lastError = 'show: $e'; }
  }

  /// Notifikasi berulang tiap hari pada jam tertentu (waktu setempat), terlepas dari apakah aplikasi sudah dibuka hari itu.
  static Future<void> daily(int id, int hour, int minute, String title, String body, String sub) async {
    if (!_ok) return;
    try {
      final n = DateTime.now();
      var at = DateTime(n.year, n.month, n.day, hour, minute);
      if (!at.isAfter(n)) at = DateTime(n.year, n.month, n.day + 1, hour, minute);
      await _n.zonedSchedule(id, title, body, tz.TZDateTime.from(at, tz.UTC), _d(sub),
          androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle, matchDateTimeComponents: DateTimeComponents.time);
    } catch (e) { lastError = 'daily: $e'; }
  }

  static Future<void> cancelReminders() async {
    if (!_ok) return;
    for (var i = 101; i <= 103; i++) {
      try { await _n.cancel(i); } catch (_) {}
    }
  }

  /// Nyalakan/matikan pengecekan notifikasi di latar belakang (hanya HP, hanya saat sudah masuk).
  static Future<void> watch(bool on) async {
    if (kIsWeb || !_ok) return;
    try {
      if (on) {
        await Workmanager().registerPeriodicTask('hulhup-notif', 'check', frequency: const Duration(minutes: 15), constraints: Constraints(networkType: NetworkType.connected));
      } else {
        await Workmanager().cancelByUniqueName('hulhup-notif');
      }
    } catch (e) { lastError = 'watch: $e'; }
  }
}
