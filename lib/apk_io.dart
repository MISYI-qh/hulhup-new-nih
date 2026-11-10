import 'dart:io';
import 'package:http/http.dart' as http;
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';

/// Android: unduh dengan progres di tampilan sendiri, lalu buka pemasang sistem.
Future<void> fetchApk(String url, void Function(double p) onProgress) async {
  final c = http.Client();
  try {
    final r = await c.send(http.Request('GET', Uri.parse(url)));
    if (r.statusCode != 200) throw Exception('http ${r.statusCode}');
    final d = await getTemporaryDirectory();
    final f = File('${d.path}/hulhup.apk');
    final sink = f.openWrite();
    var got = 0;
    final total = r.contentLength ?? 0;
    await for (final ch in r.stream) {
      sink.add(ch);
      got += ch.length;
      if (total > 0) onProgress(got / total);
    }
    await sink.close();
    onProgress(1);
    final res = await OpenFilex.open(f.path, type: 'application/vnd.android.package-archive');
    if (res.type != ResultType.done) throw Exception(res.message);
  } finally { c.close(); }
}
