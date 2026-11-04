import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:timezone/data/latest.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

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
}
