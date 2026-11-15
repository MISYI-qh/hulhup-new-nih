# Hulhup — token desain (web = acuan; aplikasi menyamai)

- **Warna**: ink `#111` / `#F2F2F2` (gelap), bg `#FFF` / `#0B0B0B`, soft `#F4F4F4` / `#1A1A1A`, kartu `#FFF` / `#141414`, hairline ink 7%, brand violet `#5B47F5` (deep `#4330D0`), aksen tautan `#2B6FDE` / `#7DB4FF`, sorot/merah `#E0524A`, krem tombol `#FBF6E9`. Tanpa hijau/kuning. Logo tidak diubah.
- **Font**: Outfit; judul 800, isi 500-600; ukuran isi 15.5, sub 12.5-13.5, judul bar 20, angka besar 38. letter-spacing judul −0.4.
- **Bentuk**: tombol utama pill tinggi 52 (ink di atas bg), ghost = soft; field radius 28; kartu post radius 28 + garis hairline + bayangan sangat tipis (`0 1 2 .04`, `0 8 24 −12 .12`); sheet radius 32; chip radius 22; avatar bulat penuh TANPA cincin/bingkai putih.
- **Jarak**: gutter halaman 20; antar kartu 12; antar elemen 10-14; lebar maks 520 di tengah.
- **Gerak**: halaman masuk fade + naik 8px 200ms (cubic-bezier .2,.8,.2,1); sheet naik 280ms; tombol tekan scale .94 120ms; hanya transform/opacity; hormati reduced-motion.
- **Memuat**: layar muat awal = ikon logo di tengah; daftar = skeleton shimmer (kartu: avatar, 2 baris teks, bar), bukan spinner.
- **Gulir**: tidak ada gulir samping; halaman menggulir sebagai satu kolom; kotak gulir dalam hanya untuk sheet/pemilih (overscroll contain).
- **Daftar**: Hubungan = baris `urow` (avatar 46, nama ellipsis, chip label maks 30% lebar, tombol aksi 48 tidak menyusut).
