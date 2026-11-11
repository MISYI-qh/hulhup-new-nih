# Deks v2

Deks adalah pemeriksa asal foto dan audio buatan Hulhup. Tanpa AI/LLM, tanpa layanan luar, tanpa biaya. Kodenya ada di `lib/deks/`.

## Prinsip

**Deks hanya menandai bila berkas membawa bukti keras bahwa ia dibuat atau diedit AI.** Menuduh orang memakai foto/suara AI padahal asli lebih merusak daripada melewatkan satu karya AI yang jejaknya sudah dihapus. Tanda yang muncul: "Audio oleh AI", "Audio diedit dengan AI", "Foto dibuat oleh AI", "Foto diedit dengan AI".

## Lapisan

Foto (diperiksa pada berkas ASLI yang dikirim klien, atau sidecar keterangannya bila berkas asli > 3 MB):

| Lapisan | Yang diperiksa | Bukti |
|---|---|---|
| `c2pa` | Content Credentials (JUMBF: APP11 JPEG, `caBX` PNG, `C2PA` WebP): penanda sumber `trainedAlgorithmicMedia` / `compositeWithTrainedAlgorithmicMedia` dan nama generator (OpenAI, Firefly, dll.) | keras |
| `iptc-xmp` | XMP/IPTC `DigitalSourceType`, `AISystemUsed`, `AIPromptInformation`, `CreatorTool` | keras |
| `params` | catatan parameter generator: Stable Diffusion/A1111 (`Steps/Sampler/CFG`), ComfyUI (alur kerja), NovelAI, InvokeAI, Fooocus, SwarmUI, Midjourney (Job ID) di teks PNG, EXIF, XMP | keras |
| `tag` | nama alat/pernyataan AI di EXIF (Software, Artist…), teks PNG, komentar JPEG, XMP | keras di bidang alat; "lunak" di takarir bebas |
| `stego` | info generator tersembunyi di bit terendah piksel PNG (`stealth_pnginfo`/`stealth_pngcomp`, NovelAI & A1111) | keras |
| `sd-watermark` | watermark tak terlihat Stable Diffusion v1/v2 dan SDXL (DWT-DCT, `invisible-watermark`), dicocokkan persis | keras |
| jejak kamera | Make+Model+data pemotretan utuh: kata AI di takarir bebas diabaikan | pelindung |

Audio (MP3/ID3, M4A/MP4, WAV/RIFF, Ogg/Opus, FLAC, WebM): `c2pa`, `iptc-xmp`, dan `tag` (ID3 `TXXX/COMM/TPE1/TSSE…`, MP4 `©too/©cmt/desc…`, RIFF `ISFT/ICMT…`, komentar Vorbis/Opus/FLAC) yang menyebut ElevenLabs, Suno, Udio, Coqui/XTTS, Stable Audio, MusicGen, dsb.

Pencocokan memakai kata utuh ("audio" tidak dikira "udio") dan mengabaikan kalimat yang dinegasikan ("not AI generated"). "Dibuat" = generator; "diedit" = penanda `compositeWithTrainedAlgorithmicMedia` atau pernyataan edit AI. Jenis AI-murni menang bila keduanya ada.

## Yang sengaja TIDAK dipakai untuk menuduh

Sudah diukur di korpus uji (korpus ada di sandbox pengembangan, skrip di `tools/`):

* Foto: derau, spektrum frekuensi, blok JPEG, ukuran generator, rasio frekuensi tinggi. Pada 208 foto asli vs 37 foto AI, AUC ≈ 0,5 (setara tebak). Satu pengecualian: puncak spektrum periode 8/4 px terpisah baik (AUC 0,93) pada 41 PNG lossless buatan gpt-image, tetapi itu satu generator, sampel kecil, dan hilang begitu dikompres JPEG, jadi tidak boleh menuduh.
* Audio: noise floor, keheningan digital, bandwidth, sample rate, ciri LFCC. Pada 76 rekaman asli vs 50 klip TTS (Kokoro, VITS, Matcha+HiFi-GAN), pemisahan hanya karena sample rate/dataset. Pengklasifikasi LFCC yang dilatih gagal pada mesin TTS yang belum pernah dilihat: pada ambang tanpa salah tuduh, 0% terdeteksi.

Detektor "isi" yang beredar (dan layanan komersial) pun memberi kesalahan; di sini kesalahan tuduh dianggap lebih buruk daripada lolos.

## Hasil ukur

* 137 gambar asli buatan OpenAI (gpt-image, Content Credentials) dan 2 PNG Stable Diffusion (parameter tertanam) di repo uji: 139/139 ditandai.
* ±1.640 gambar lain (foto kamera dengan EXIF, foto web, tangkapan layar, diagram) di repo uji: 0 ditandai. Korpus foto asli 208 × 6 varian (asli, PNG, JPEG q92/q70, 720 px, WebP): 0 ditandai. Audio asli 76 × 5 varian (WAV, MP3, AAC, Opus, 16 kHz): 0 ditandai.
* Watermark SD v1/v2/SDXL: terbaca dari PNG buatan encoder resmi (fixture di `test/fixtures`). Tidak bertahan kompresi JPEG (diuji juga pada decoder resmi).
* `GET /deks/selftest` menjalankan 34 contoh (penanda alat asli yang ditiru, dan kasus yang tidak boleh ditandai) langsung di server.

## Batas (jujur)

* Karya AI yang metadatanya hilang (tangkapan layar, unggah ulang lewat platform yang membersihkan metadata, kompresi ulang, rekam ulang lewat speaker) **tidak terdeteksi**.
* Watermark tak terlihat milik Google (SynthID), Meta, dan Resemble hanya bisa dibaca detektor pemiliknya; Deks hanya membaca penanda yang berupa metadata terbuka dan watermark Stable Diffusion.
* Pada foto profil, klien mengirim berkas asli (≤ 3 MB) atau sidecar keterangannya; foto yang disimpan tetap versi kecil 720 px tanpa EXIF/GPS.
* Aplikasi versi lama mengirim foto yang sudah dikecilkan: tanpa metadata asli, jadi tak ada yang bisa dibaca.

## Menambah bukti baru

Tambahkan pola ke `lib/deks/text.js` (nama alat, parameter) atau lapisan baru ke `lib/deks/index.js`, tambahkan contoh ke `lib/deks/selftest.js` (satu yang harus ditandai, satu yang tidak), lalu jalankan `PGLITE=1 node --test test/api.test.js` dan `node tools/deks-eval.mjs <korpus>`. Syarat lapisan baru: 0 salah-tuduh di korpus asli.
