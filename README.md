# Hulhup (produk Misyi) - mode penyimpanan lokal
Aplikasi Flutter (Android, iOS, web, desktop). Saat ini SEMUA data (akun, audio, like, ikuti, notifikasi) disimpan lokal di perangkat/browser lewat shared_preferences. Tidak ada server.

STATUS: build lolos di GitHub Actions. Lapisan data (lib/core.dart `Local`) punya tes otomatis di test/ dan dijalankan oleh workflow `check` (flutter analyze + flutter test). Antarmuka di HP/browser belum diuji manual.

Konsekuensi mode lokal:
- Suara acak hanya berasal dari audio yang diunggah di perangkat itu sendiri (sesuai pilihan audiens: publik, pengikut, mengikuti, atau pengikut dan mengikuti).
- Akun hanya ada di perangkat itu; hapus data aplikasi/browser = semua hilang.
- Di web, penyimpanan browser terbatas (kira-kira 5 MB), jadi hanya muat beberapa audio dan foto.

## Build
GitHub: upload isi folder ini, Actions > build > Run workflow, unduh artifact hulhup-apk dan hulhup-web.
Di PC: flutter create . --platforms=android,web,linux,windows,macos,ios && flutter pub get && dart run flutter_launcher_icons && flutter run

Folder `backend/` (Cloudflare Worker + D1 + R2) belum dipakai; disiapkan untuk tahap online nanti. Antarmuka `Api` di lib/core.dart sama, jadi tinggal diganti.
Font: Outfit (lisensi OFL, assets/fonts). Teks Tentang/Kebijakan/Privasi ada di lib/core.dart; mohon ditinjau sebelum rilis.

## Catatan versi 1.1.0
- Siapa yang bisa melihat audio di profil diatur lewat Pengaturan (publik, pengikut, mengikuti, pengikut dan mengikuti, hanya untuk saya). "Hanya untuk saya" hanya berlaku untuk profil, bukan untuk acak. Pilihan acak tetap per audio.
- Pencarian mencari akun dan audio (lewat deskripsi). Deskripsi maksimal 200 karakter, foto profil maksimal 3 MB, foto profil bisa dipratinjau.
- Audio di popup/profil berulang terus sampai dijeda; berhenti saat popup atau halaman ditutup.
- Notifikasi di HP (flutter_local_notifications): pengingat jam 19.00 jika belum masuk hari itu ("Kamu lelah? Coba lah untuk mendengarkan beberapa suara"), notifikasi suka/pengikut baru, dan hitungan hari berturut-turut. Ikon notifikasi dari tool/android_res, diatur oleh tool/setup_android.sh. Di web hanya ada notifikasi di dalam aplikasi.
