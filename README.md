# Hulhup (produk Misyi) - mode penyimpanan lokal
Aplikasi Flutter (Android, iOS, web, desktop). Saat ini SEMUA data (akun, audio, like, ikuti, notifikasi) disimpan lokal di perangkat/browser lewat shared_preferences. Tidak ada server.

STATUS: kode sudah ditulis tetapi BELUM dikompilasi dan BELUM dites. Jalankan build lalu laporkan error yang muncul.

Konsekuensi mode lokal:
- Suara acak hanya berasal dari audio yang diunggah di perangkat itu sendiri.
- Akun hanya ada di perangkat itu; hapus data aplikasi/browser = semua hilang.
- Di web, penyimpanan browser terbatas (kira-kira 5 MB), jadi hanya muat beberapa audio dan foto.

## Build
GitHub: upload isi folder ini, Actions > build > Run workflow, unduh artifact hulhup-apk dan hulhup-web.
Di PC: flutter create . --platforms=android,web,linux,windows,macos,ios && flutter pub get && dart run flutter_launcher_icons && flutter run

Folder `backend/` (Cloudflare Worker + D1 + R2) belum dipakai; disiapkan untuk tahap online nanti. Antarmuka `Api` di lib/core.dart sama, jadi tinggal diganti.
Font: Outfit (lisensi OFL, assets/fonts). Teks Tentang/Kebijakan/Privasi ada di lib/core.dart; mohon ditinjau sebelum rilis.
