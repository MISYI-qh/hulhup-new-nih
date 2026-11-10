import 'package:web/web.dart' as web;

/// Web: mulai unduhan dari halaman ini juga (tanpa membuka tab baru).
Future<void> fetchApk(String url, void Function(double p) onProgress) async {
  final a = web.HTMLAnchorElement()..href = url..download = 'hulhup.apk';
  web.document.body!.append(a);
  a.click();
  a.remove();
  onProgress(1);
}
