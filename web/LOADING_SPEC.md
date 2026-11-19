# Spesifikasi animasi muat (web = Android, harus identik)

Sumber kebenaran web: `app/intro.css` (dibuat `tool/gen_intro.mjs`), `components/LogoRefresh.tsx`, `components/skel.tsx`. Sumber asli gerak: Flutter lama `lib/ui.dart` (Intro, _PeekPainter).

## 1. Intro / splash (sekali per sesi, 3400 ms, linear; kurva ada di dalam keyframe)
Waktu t = 0..1 (D = 3400 ms). Latar = warna latar tema. Logo 96 x 66.667 (lebar x tinggi), font Outfit 700 52sp letterSpacing -1.2.
- Mata turun ke balik dinding: ramp(.05,.17) easeInCubic; naik: ramp(.21,.38) easeOutBack; `rise` = t<.2 ? 1-down : up (batas 0..1.06). Gerak mata = (1-rise)*0.30*U ke bawah, U = lebar logo 96.
- `read` = easeInOutCubic(ramp(.40,.84)); `look` = -0.4 + 3*read; pupil geser look*0.03*U.
- `blink` (.88..95) = sin((t-.88)/.07*pi): mata & pupil scaleY 1-.92*blink / 1-.9*blink, pupil turun .035*U*blink.
- `pop` = 1 + .07*sin(pi*ramp(.21,.45)) (skala logo).
- Gelombang: wave = ramp(.22,.62); dua lingkaran, k = wave*1.3 - i*.22 (i=0,1), radius 40+easeOutCubic(k)*170, garis 2.4, alpha (1-k)*.28, warna mata.
- Huruf H,u,l,h,u,p muncul satu-satu: p_i = easeOutCubic(clamp(read*6.6 - i)); opacity p_i, naik (1-p_i)*16. Seluruh grup (logo+teks) digeser ke kiri sebesar (96+read*(14+lebarTeks))/2 agar tetap di tengah. Lebar huruf Outfit 52: [36.76,26.83,12.37,28.54,26.83,29.74], jarak logo-teks 14.
- Fade out: 1 - easeIn(ramp(.95,1)).
- Kunjungan berikutnya dalam sesi, atau gerak dikurangi: tanpa intro; logo diam (t=0) lalu memudar 300 ms saat data siap.
Warna: terang mata #5B47F5 pupil #FFF dinding #4330D0; gelap mata #FFF pupil #5B47F5 dinding #5B47F5.

## 2. Tarik-untuk-muat (LogoRefresh) — konten ikut tertarik
- Jari turun dy -> offset = 88 * (1 - exp(-dy/120)) (karet), konten (semua isi di bawah bilah atas) bergeser ke bawah sebesar offset. Tidak ada animasi saat menyeret.
- Logo 34 (AnimMark loop 1500 ms, first=0) di celah atas konten: pusat vertikal = offset/2; opacity = min(1, offset/24); skala = .6 + .4*min(1, offset/56).
- Lepas jari: offset >= 56 -> konten menahan di 56 (animasi 260 ms cubic-bezier(.2,.8,.2,1)), panggil muat ulang, tahan minimal 700 ms, lalu kembali ke 0 (260 ms, kurva sama). Di bawah 56 -> kembali ke 0 (260 ms).
- Hanya aktif saat daftar sudah di paling atas dan geseran dominan vertikal. Dipakai di: Hups, Profil, Hubungan (sama seperti Flutter).

## 3. Kerangka abu-abu per halaman (mengikuti tata letak asli)
- Warna: `--soft` dengan kilau (gradien 100deg, 30%/50%/70%, kilau = ink 7%), siklus 1300 ms linear, tak ada saat gerak dikurangi.
- Muncul tertunda: tersembunyi 120 ms pertama, lalu fade-in 220 ms (supaya muat cepat tidak berkedip).
- Bentuk: Post (kartu radius 28: avatar 44, 2 baris nama, 1-2 baris teks, bilah audio 44 radius 22, 3 aksi), Profil (avatar 96, nama 26, @user 15, bio 2 baris, 3 statistik 18, tombol 52, tab 48, lalu 2 kartu post), Daftar pengguna (baris radius 26: avatar 46 + 2 baris + bulatan 24), Hubungan (judul 13 + baris dengan chip 64x26), Notifikasi (kartu radius 26: avatar 46 + 2 baris), Halaman post (pemilik 48, 3 baris teks, tombol 52, aksi, 3 komentar avatar 36), Kalender runtun (chip 64, bilah bulan, grid 7x5 bulatan 40), Formulir (4 bidang label 12 + kolom 52 radius 26 + tombol), Baris sesi (4 x 68 radius 26).
- Halaman yang dituju menentukan bentuk; bilah atas ikut (tombol kembali + judul abu-abu).

## 4. Font
Outfit Regular/Bold dipakai di web (woff2 di `public/fonts`) sama dengan Android (`res/font`).
