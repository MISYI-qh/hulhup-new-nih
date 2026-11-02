# Hulhup (Flutter: Android, iOS, web, desktop)
Status: kode ditulis, BELUM dikompilasi/dites. Data masih lokal (Store di lib/main.dart); backend belum ada.
Build: push ke GitHub, jalankan workflow "build" (Actions) -> unduh hulhup-apk dan hulhup-web.
Atau di PC: flutter create . --platforms=android,web,linux,windows,macos,ios && flutter pub get && flutter run
Android: tambahkan izin RECORD_AUDIO di android/app/src/main/AndroidManifest.xml dan NSMicrophoneUsageDescription di iOS.
