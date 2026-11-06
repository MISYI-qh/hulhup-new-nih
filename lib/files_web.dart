import 'dart:typed_data';

// Web tidak punya berkas lokal; audio offline di web memakai penyimpanan peramban.
Future<bool> saveOffline(String name, Uint8List b) async => false;
Future<Uint8List?> readOffline(String name) async => null;
Future<void> deleteOffline(String name) async {}
