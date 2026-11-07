import 'dart:io';
import 'dart:typed_data';
import 'package:path_provider/path_provider.dart';

/// Simpan audio offline sebagai berkas sungguhan di penyimpanan aplikasi (HP).
Future<bool> saveOffline(String name, Uint8List b) async {
  try {
    final d = await getApplicationDocumentsDirectory();
    final dir = Directory('${d.path}/offline');
    await dir.create(recursive: true);
    await File('${dir.path}/$name').writeAsBytes(b, flush: true);
    return true;
  } catch (_) { return false; }
}

Future<Uint8List?> readOffline(String name) async {
  try {
    final d = await getApplicationDocumentsDirectory();
    final f = File('${d.path}/offline/$name');
    return await f.exists() ? await f.readAsBytes() : null;
  } catch (_) { return null; }
}

Future<void> deleteOffline(String name) async {
  try {
    final d = await getApplicationDocumentsDirectory();
    final f = File('${d.path}/offline/$name');
    if (await f.exists()) await f.delete();
  } catch (_) {}
}

/// Nama arsitektur CPU (mis. android_arm64) untuk memilih berkas APK yang cocok.
String abiName() => Platform.version;
