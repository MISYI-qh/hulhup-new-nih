import 'dart:typed_data';
import 'dart:ui' as ui;
import 'package:image/image.dart' as img;

/// Perkecil foto profil ke sisi terpanjang 720 px dan simpan sebagai JPEG (metadata/GPS tidak ikut).
Future<Uint8List> shrinkAvatar(Uint8List orig, {int maxSide = 720}) async {
  final buf = await ui.ImmutableBuffer.fromUint8List(orig);
  final desc = await ui.ImageDescriptor.encoded(buf);
  try {
    final w = desc.width, h = desc.height, k = maxSide / (w > h ? w : h);
    final tw = k < 1 ? (w * k).round().clamp(1, maxSide) : w, th = k < 1 ? (h * k).round().clamp(1, maxSide) : h;
    final codec = await desc.instantiateCodec(targetWidth: tw, targetHeight: th);
    final fr = await codec.getNextFrame();
    final bd = await fr.image.toByteData(format: ui.ImageByteFormat.rawRgba);
    final rgba = bd!.buffer.asUint8List();
    final im = img.Image(width: fr.image.width, height: fr.image.height, numChannels: 3);
    for (var i = 0, o = 0; i < rgba.length; i += 4, o++) {
      final a = rgba[i + 3];
      final r = a == 255 ? rgba[i] : (rgba[i] * a + 255 * (255 - a)) ~/ 255;
      final g = a == 255 ? rgba[i + 1] : (rgba[i + 1] * a + 255 * (255 - a)) ~/ 255;
      final b = a == 255 ? rgba[i + 2] : (rgba[i + 2] * a + 255 * (255 - a)) ~/ 255;
      im.setPixelRgb(o % im.width, o ~/ im.width, r, g, b);
    }
    fr.image.dispose();
    return Uint8List.fromList(img.encodeJpg(im, quality: 85));
  } finally {
    desc.dispose();
    buf.dispose();
  }
}

const _origMax = 3000000;

/// Paket untuk server: 'DKS1' + jenis(0=berkas asli, 1=sidecar) + panjang(4) + bahan Deks + foto yang disimpan.
/// Berkas asli ≤ 3 MB dikirim utuh; yang lebih besar hanya dikirim bagian keterangannya (EXIF/XMP/teks PNG/C2PA).
Uint8List packAvatar(Uint8List orig, Uint8List stored) {
  final whole = orig.length <= _origMax;
  final meta = whole ? orig : sidecar(orig);
  final h = ByteData(9);
  h.setUint8(0, 0x44); h.setUint8(1, 0x4b); h.setUint8(2, 0x53); h.setUint8(3, 0x31);
  h.setUint8(4, whole ? 0 : 1);
  h.setUint32(5, meta.length, Endian.big);
  return (BytesBuilder(copy: false)..add(h.buffer.asUint8List())..add(meta)..add(stored)).toBytes();
}

/// Salinan berkas tanpa piksel: hanya segmen/chunk keterangan, dengan struktur yang tetap terbaca server.
Uint8List sidecar(Uint8List b) {
  const cap = 900000;
  final out = BytesBuilder(copy: false);
  var kept = 0;
  int u32(int o) => (b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3];
  try {
    if (b.length > 4 && b[0] == 0xff && b[1] == 0xd8) {
      out.add([0xff, 0xd8]);
      var o = 2;
      while (o + 4 <= b.length && b[o] == 0xff) {
        final m = b[o + 1];
        if (m == 0xda || m == 0xd9) break;
        if (m == 0xd8 || (m >= 0xd0 && m <= 0xd7) || m == 0x01) { o += 2; continue; }
        final len = (b[o + 2] << 8) | b[o + 3];
        if (len < 2 || o + 2 + len > b.length) break;
        if ((m == 0xe1 || m == 0xeb || m == 0xed || m == 0xfe) && kept + len < cap) { out.add(Uint8List.sublistView(b, o, o + 2 + len)); kept += len; }
        o += 2 + len;
      }
      out.add([0xff, 0xd9]);
    } else if (b.length > 8 && b[0] == 0x89 && b[1] == 0x50) {
      out.add(Uint8List.sublistView(b, 0, 8));
      var o = 8;
      const want = {'IHDR', 'tEXt', 'zTXt', 'iTXt', 'eXIf', 'caBX'};
      while (o + 12 <= b.length) {
        final len = u32(o);
        if (len < 0 || o + 12 + len > b.length) break;
        final t = String.fromCharCodes(b.sublist(o + 4, o + 8));
        if (want.contains(t) && (t == 'IHDR' || kept + len < cap)) { out.add(Uint8List.sublistView(b, o, o + 12 + len)); kept += len; }
        if (t == 'IEND') break;
        o += 12 + len;
      }
      out.add([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
    } else if (b.length > 12 && String.fromCharCodes(b.sublist(0, 4)) == 'RIFF' && String.fromCharCodes(b.sublist(8, 12)) == 'WEBP') {
      final body = BytesBuilder(copy: false)..add([0x57, 0x45, 0x42, 0x50]);
      var o = 12;
      while (o + 8 <= b.length) {
        final id = String.fromCharCodes(b.sublist(o, o + 4));
        final len = b[o + 4] | (b[o + 5] << 8) | (b[o + 6] << 16) | (b[o + 7] << 24);
        if (o + 8 + len > b.length) break;
        if ((id == 'EXIF' || id == 'XMP ' || id == 'C2PA') && kept + len < cap) { body.add(Uint8List.sublistView(b, o, o + 8 + len + (len & 1 == 1 && o + 9 + len <= b.length ? 1 : 0))); kept += len; }
        o += 8 + len + (len & 1);
      }
      final bd = body.toBytes();
      final h = ByteData(8);
      h.setUint8(0, 0x52); h.setUint8(1, 0x49); h.setUint8(2, 0x46); h.setUint8(3, 0x46);
      h.setUint32(4, bd.length, Endian.little);
      out.add(h.buffer.asUint8List());
      out.add(bd);
    }
  } catch (_) {/* berkas rusak: kirim yang sudah terkumpul */}
  return out.toBytes();
}
