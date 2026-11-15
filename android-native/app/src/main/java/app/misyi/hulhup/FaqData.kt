package app.misyi.hulhup

/** Teks FAQ (dihasilkan dari extra.dart lewat web/content/legal.json). */
object FaqData {
    val id: List<Pair<String, String>> = listOf(
        "Apa itu Hulhup?" to "Ruang suara dan tulisan buatan Misyi. Ketuk tombol Acak untuk mendengar suara singkat dari orang lain, atau buka Hups untuk menjelajah post, komentar, dan balasan.",
        "Apa bedanya Acak dan Hups?" to "Acak memilih satu post secara acak 100% rata, bisa berupa audio, teks saja, atau post dengan backsound. Hups adalah linimasa; urutannya dipengaruhi waktu (35%), sorot (25%), komentar (25%), dan kecocokan dengan pencarianmu (15%).",
        "Bisakah memposting teks saja?" to "Bisa. Post boleh berisi tulisan saja, audio saja, atau keduanya. Panjang tulisan tidak dibatasi; di kartu hanya tampil sebagian dan \"Selengkapnya\" membuka teks penuh.",
        "Apa itu backsound?" to "Audio pada post yang kamu pilih sebagai pengiring (saat menambah audio, nyalakan \"Jadikan backsound\"). Terputar otomatis saat post terlihat dan bisa dibisukan pembaca kapan saja. Kalau tidak dinyalakan, audio itu audio biasa yang diputar dengan tombol putar.",
        "Berapa batas audio?" to "Satu post maksimal 1 audio, 15 detik dan 1 MB. Komentar hanya tulisan, tanpa audio.",
        "Apa arti \"dilihat\" dan \"diputar\"?" to "Jumlah akun yang melihat dan memutar post. Tiap akun dihitung satu kali, seberapa sering pun melihat atau memutar. \"Diputar\" hanya ada pada post dengan audio biasa.",
        "Apa itu sorot?" to "Tanda suka. Ketuk ikon lampu sorot untuk menyorot sebuah post atau komentar.",
        "Apa yang bisa dicari?" to "Semuanya: nama atau nama pengguna akun, bio, isi post, penulis, tag @nama, dan isi komentar. Beberapa kata dicocokkan sekaligus.",
        "Bisakah dipakai tanpa internet?" to "Aplikasi tetap terbuka. Acak dan Offline memutar post yang kamu simpan sendiri di perangkat. Pencarian, Pengaturan, Edit profil, Hups, dan membuat post butuh internet.",
        "Bagaimana menandai akun?" to "Ketik @nama pengguna di post atau komentar. Ketuk tag untuk membuka akun itu; akun yang ditandai mendapat notifikasi.",
        "Siapa yang bisa melihat post saya?" to "Kamu memilih saat membuat post, bisa lebih dari satu (publik, pengikut, hubungan, akun tertentu, dan lainnya).",
        "Bagaimana menyematkan komentar?" to "Penulis post membuka menu komentar lalu memilih Sematkan komentar.",
        "Bagaimana melaporkan konten?" to "Buka menu pada post atau komentar, lalu pilih Laporkan.",
        "Apa itu tanda AI?" to "Deks memeriksa audio dan foto dari bukti di dalam berkasnya. Bila ada bukti kuat, muncul tanda seperti \"Audio oleh AI\". Tanpa bukti, tidak ada tanda.",
        "Saya lupa kata sandi." to "Di halaman masuk pilih Lupa kata sandi, lalu masukkan nama pengguna dan kode pemulihan yang diberikan saat mendaftar. Kode baru dibuat tiap dipakai. Tidak ada email, jadi simpan kodenya.",
        "Bagaimana membagikan post atau akun?" to "Setiap post dan akun punya alamat sendiri, misalnya hulhup.my.id/p/18 atau hulhup.my.id/u/nama. Tautan itu terbuka langsung di halaman yang dituju.",
        "Bagaimana menghapus notifikasi?" to "Di Notifikasi ketuk Pilih untuk memilih beberapa, atau Hapus semua.",
    )
    val en: List<Pair<String, String>> = listOf(
        "What is Hulhup?" to "A home for voices and writing by Misyi. Tap Random to hear a short voice from someone else, or open Hups to browse posts, comments and replies.",
        "Random vs Hups?" to "Random picks one post 100% evenly at random: an audio post, a text-only post, or a post with a backsound. Hups is a timeline ranked by recency (35%), spotlights (25%), comments (25%) and how well a post matches your searches (15%).",
        "Can I post text only?" to "Yes. A post can hold text only, audio only, or both. Text length is not limited; a card shows part of it and \"Read more\" opens the full text.",
        "What is a backsound?" to "The audio of a post that you choose as a soundtrack (when adding audio, turn on \"Use as backsound\"). It plays automatically while the post is in view and readers can mute it anytime. If you leave it off, the audio is a regular audio played with the play button.",
        "Audio limits?" to "A post has at most 1 audio, 15 seconds and 1 MB. Comments are text only, no audio.",
        "What do \"views\" and \"plays\" mean?" to "The number of accounts that viewed and played a post. Each account counts once, however often it views or plays. \"Plays\" only exists on posts with a regular audio.",
        "What is a spotlight?" to "A like. Tap the spotlight icon on a post or comment.",
        "What can I search?" to "Everything: account names and usernames, bios, post text, authors, @tags and comment text. Several words are matched together.",
        "Can I use it offline?" to "The app still opens. Random plays audio that was saved automatically on your device, and Offline audio can be played. Search, Settings, Edit profile, Hups and posting need internet.",
        "How do I tag someone?" to "Type @username in a post or comment. Tap a tag to open that account; tagged accounts get a notification.",
        "Who can see my posts?" to "You choose when posting, and can pick more than one (public, followers, relations, specific accounts, and more).",
        "How do I pin a comment?" to "The post author opens the comment menu and picks Pin comment.",
        "How do I report content?" to "Open the menu on a post or comment and choose Report.",
        "What is the AI mark?" to "Deks checks audio and photos for evidence inside the file. With strong evidence a mark such as \"Audio by AI\" appears. Without evidence, no mark.",
        "I forgot my password." to "On the sign-in page choose Forgot password, then enter your username and the recovery code given at sign-up. A new code is issued each time. There is no email, so keep the code safe.",
        "How do I share a post or profile?" to "Every post and account has its own address, e.g. hulhup.my.id/p/18 or hulhup.my.id/u/name. The link opens straight to that page.",
        "How do I delete notifications?" to "In Notifications tap Select to choose several, or Delete all.",
    )
}
