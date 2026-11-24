package app.misyi.hulhup

import android.annotation.SuppressLint
import android.net.Uri
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import org.json.JSONObject

/** Deteksi tautan di teks bebas: http(s)://…, www.…, atau domain tanpa https (padanan linkRe di extra.dart). */
val linkRe = Regex(
    "(?<![@\\w./-])((?:https?:\\/\\/)[^\\s<>\"]+|(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+(?:com|id|net|org|io|app|dev|co|me|xyz|link|site|online|tv|ai|gg|ly|info|biz|my\\.id|web\\.id|co\\.id|go\\.id|ac\\.id|sch\\.id)(?::\\d+)?(?:\\/[^\\s<>\"]*)?)",
    RegexOption.IGNORE_CASE)

/** Pisahkan tanda baca di ujung tautan agar tidak ikut. */
fun trimLink(s: String): String { var t = s; while (t.isNotEmpty() && ".,;:!?)]}'\"".indexOf(t.last()) >= 0) t = t.dropLast(1); return t }

fun linkUri(raw: String): Uri? {
    val t = raw.trim()
    val u = try { Uri.parse(if (Regex("^https?://", RegexOption.IGNORE_CASE).containsMatchIn(t)) t else "https://$t") } catch (_: Exception) { return null }
    if (u.host.isNullOrEmpty() || (u.scheme != "http" && u.scheme != "https")) return null
    return u
}

/** Tautan pertama di teks post (tanpa tanda baca di ujung), atau null. */
fun firstUrl(text: String): String? {
    for (m in linkRe.findAll(text)) {
        val u = trimLink(m.value); if (u.isEmpty() || u.startsWith("@")) continue
        linkUri(u)?.let { return it.toString() }
    }
    return null
}

/** Buka tautan: halaman Hulhup di dalam aplikasi, situs lain lewat peramban dalam aplikasi. */
fun openLink(raw: String) {
    val u = linkUri(raw) ?: return
    val h = (u.host ?: "").lowercase()
    if (h == "hulhup.my.id" || h == "www.hulhup.my.id") { pageFor(u.encodedPath.let { if (it.isNullOrEmpty()) "/" else it })?.let { Nav.go(it); return } }
    Nav.go(Screen("browser") { BrowserPage(u.toString()) })
}

@SuppressLint("SetJavaScriptEnabled")
@Composable fun BrowserPage(url: String) {
    var progress by remember { mutableIntStateOf(0) }; var title by remember { mutableStateOf("") }; var cur by remember { mutableStateOf(url) }
    var wv by remember { mutableStateOf<WebView?>(null) }
    val host = try { Uri.parse(cur).host ?: "" } catch (_: Exception) { "" }
    BackHandler { val w = wv; if (w != null && w.canGoBack()) w.goBack() else Nav.back() }
    Column(Modifier.fillMaxSize().background(bgOf())) {
        Row(Modifier.fillMaxWidth().statusBarsPadding().padding(4.dp), verticalAlignment = Alignment.CenterVertically) {
            IconBtn(Icons.Rounded.Close) { Nav.back() }
            Column(Modifier.weight(1f)) {
                HText(title.ifEmpty { host }, 15f, FontWeight.ExtraBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                HText(host, 12f, color = sub(), maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            IconBtn(Icons.Rounded.Refresh) { wv?.reload() }
            IconBtn(Icons.Rounded.ContentCopy) { Plat.copy(cur); toast(Store.t("link_copied")) }
            IconBtn(Icons.Rounded.OpenInNew) { Plat.openExternal(cur) }
        }
        if (progress < 100) LinearProgressIndicator(progress = { progress / 100f }, Modifier.fillMaxWidth().height(2.dp), color = ink(), trackColor = Color.Transparent)
        AndroidView(modifier = Modifier.weight(1f).fillMaxWidth(), factory = { c ->
            WebView(c).apply {
                settings.javaScriptEnabled = true; settings.domStorageEnabled = true
                webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(v: WebView, r: WebResourceRequest): Boolean { val s = r.url.scheme; return !(s == "http" || s == "https" || s == "about") }
                    override fun onPageFinished(v: WebView, u: String?) { title = v.title ?: ""; cur = v.url ?: cur }
                }
                webChromeClient = object : WebChromeClient() { override fun onProgressChanged(v: WebView, p: Int) { progress = p } }
                loadUrl(url); wv = this
            }
        }, onRelease = { it.destroy() })
    }
}

// ───────── Pratinjau tautan di post ─────────
enum class UrlKind { Image, Video, Audio, Page }
private val imgRe = Regex("\\.(jpe?g|png|gif|webp|avif|bmp|svg)$", RegexOption.IGNORE_CASE)
private val vidRe = Regex("\\.(mp4|webm|mov|m4v|ogv)$", RegexOption.IGNORE_CASE)
private val audRe = Regex("\\.(mp3|m4a|aac|ogg|oga|opus|wav|flac)$", RegexOption.IGNORE_CASE)

fun kindOfUrl(url: String): UrlKind {
    val p = try { Uri.parse(url).path ?: "" } catch (_: Exception) { "" }
    return when { imgRe.containsMatchIn(p) -> UrlKind.Image; vidRe.containsMatchIn(p) -> UrlKind.Video; audRe.containsMatchIn(p) -> UrlKind.Audio; else -> UrlKind.Page }
}

/** Gambar dari situs luar dimuat lewat server Hulhup (alamat bertanda tangan), supaya situs asal tidak melihat IP pengguna. */
fun proxied(s: String) = if (s.startsWith("/")) Api.base + s else s

private val previews = HashMap<String, JSONObject?>()
private suspend fun fetchPreview(url: String): JSONObject? {
    if (previews.containsKey(url)) return previews[url]
    if (Store.me == null) return null
    return try { val j = Api.req("GET", "/preview?url=${Uri.encode(url)}"); val p = j.optJSONObject("preview"); previews[url] = p; p } catch (_: Exception) { null }
}

/** Tampilan otomatis untuk tautan di post: gambar, video, audio, atau kartu halaman. Tanpa perlu mengetuk tautannya. */
@Composable fun LinkEmbed(url: String) {
    val k = kindOfUrl(url); val host = (try { Uri.parse(url).host ?: "" } catch (_: Exception) { "" }).removePrefix("www.")
    embedOf(url)?.let { FrameEmbed(it, url); return }
    if (k == UrlKind.Video) { VideoEmbed(url); return }
    if (k == UrlKind.Audio) { AudioEmbed(url, host); return }
    var p by remember(url) { mutableStateOf<JSONObject?>(null) }; var done by remember(url) { mutableStateOf(false) }
    LaunchedEffect(url) { p = fetchPreview(url); done = true }
    val pv = p
    if (pv == null) { if (done && socialHost(url)) OpenCard(url, host); return }
    if (pv.optString("video").isNotEmpty()) { VideoEmbed(pv.optString("video"), pv.optString("image").ifEmpty { null }, socialHost(url), url); return }
    when (pv.optString("kind")) {
        "image" -> ImageEmbed(proxied(pv.optString("src")), pv.optString("url"))
        "video" -> VideoEmbed(pv.optString("url"))
        "audio" -> AudioEmbed(pv.optString("url"), host)
        else -> PageCard(url, pv)
    }
}

@Composable private fun PageCard(url: String, p: JSONObject) {
    val img = proxied(p.optString("image")); val icon = proxied(p.optString("icon")); val title = p.optString("title"); val desc = p.optString("desc")
    val host = p.optString("host"); val site = p.optString("site").ifEmpty { host }
    Tap(Modifier.padding(top = 10.dp, end = 8.dp), .985f, onTap = { openLink(url) }) {
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(soft()).border(1.dp, ink().copy(alpha = .1f), RoundedCornerShape(20.dp))) {
            if (img.isNotEmpty() && img != Api.base) Img(img, Modifier.fillMaxWidth().aspectRatio(1.91f))
            Column(Modifier.padding(14.dp, 10.dp, 14.dp, 12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (icon.isNotEmpty() && icon != Api.base) Img(icon, Modifier.padding(end = 6.dp).size(14.dp).clip(RoundedCornerShape(4.dp)))
                    HText(site, 12.5f, FontWeight.SemiBold, sub(), Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                if (title.isNotEmpty()) HText(title, 15f, FontWeight.ExtraBold, modifier = Modifier.padding(top = 4.dp), maxLines = 2, overflow = TextOverflow.Ellipsis, lh = 18.75f)
                if (desc.isNotEmpty()) HText(desc, 13.5f, color = sub(), modifier = Modifier.padding(top = 3.dp), maxLines = 2, overflow = TextOverflow.Ellipsis, lh = 17.5f)
            }
        }
    }
}

/** Gambar yang melaporkan rasio aslinya (lebar/tinggi) setelah termuat. */
@Composable private fun ImgR(url: String, modifier: Modifier, fit: ContentScale = ContentScale.Crop, onRatio: (Float) -> Unit) {
    val net = if (url.startsWith("/")) Api.base + url else url
    coil.compose.AsyncImage(model = net, contentDescription = null, modifier = modifier, contentScale = fit, onSuccess = { st ->
        val d = st.result.drawable; if (d.intrinsicWidth > 0 && d.intrinsicHeight > 0) onRatio(d.intrinsicWidth.toFloat() / d.intrinsicHeight)
    })
}

@Composable private fun ImageEmbed(url: String, orig: String) {
    val host = try { Uri.parse(orig.ifEmpty { url }).host ?: "" } catch (_: Exception) { "" }
    var ratio by remember(url) { mutableStateOf<Float?>(null) }
    val r = (ratio ?: (4f / 3f)).coerceIn(.3f, 3f)
    val maxH = androidx.compose.ui.platform.LocalConfiguration.current.screenHeightDp * .7f
    BoxWithConstraints(Modifier.fillMaxWidth().padding(top = 10.dp, end = 8.dp)) {
        val w = if (maxWidth < (maxH * r).dp) maxWidth else (maxH * r).dp
        Tap(Modifier, .99f, onTap = { Nav.go(Screen("image") { ImageViewer(url, host) }) }) {
            Box(Modifier.width(w).aspectRatio(r).clip(RoundedCornerShape(20.dp)).background(soft()).border(1.dp, ink().copy(alpha = .08f), RoundedCornerShape(20.dp))) {
                ImgR(url, Modifier.fillMaxSize()) { ratio = it }
            }
        }
    }
}

/** Video dari URL: tidak diunduh sampai diketuk (hemat kuota), lalu diputar di tempat dengan kontrol buatan sendiri. Kotak mengikuti rasio asli video. */
@Composable private fun VideoEmbed(url: String, poster: String? = null, tall: Boolean = false, orig: String? = null) {
    var started by remember { mutableStateOf(false) }; var failed by remember { mutableStateOf(false) }
    val host = (try { Uri.parse(orig ?: url).host ?: "" } catch (_: Exception) { "" }).removePrefix("www.")
    val ctx = androidx.compose.ui.platform.LocalContext.current
    val player = remember(started) { if (started) ExoPlayer.Builder(ctx).build() else null }
    DisposableEffect(player) { onDispose { player?.release() } }
    var ratio by remember { mutableStateOf<Float?>(null) }
    var playing by remember { mutableStateOf(false) }; var buffering by remember { mutableStateOf(true) }
    var muted by remember { mutableStateOf(false) }; var speed by remember { mutableStateOf(1f) }
    var pos by remember { mutableStateOf(0L) }; var dur by remember { mutableStateOf(0L) }
    var show by remember { mutableStateOf(true) }; var tick by remember { mutableStateOf(0) }
    var fs by remember { mutableStateOf(false) }
    val r = (ratio ?: (16f / 9f)).coerceIn(.3f, 3f)
    val maxH = androidx.compose.ui.platform.LocalConfiguration.current.screenHeightDp * .7f
    fun fmt(ms: Long): String { val s = (ms / 1000).toInt().coerceAtLeast(0); return "%d:%02d".format(s / 60, s % 60) }

    @Composable fun Ctl(p: ExoPlayer, full: Boolean) {
        Box(Modifier.fillMaxSize()) {
            Box(Modifier.fillMaxSize().pointerInput(Unit) { detectTapGestures { show = !show; tick++ } })
            if (buffering) androidx.compose.material3.CircularProgressIndicator(Modifier.align(Alignment.Center).size(34.dp), color = Color.White, strokeWidth = 2.5.dp)
            androidx.compose.animation.AnimatedVisibility(show || !playing, Modifier.fillMaxSize(), enter = androidx.compose.animation.fadeIn(), exit = androidx.compose.animation.fadeOut()) {
                Box(Modifier.fillMaxSize()) {
                    if (full) Tap(Modifier.align(Alignment.TopStart).statusBarsPadding(), onTap = { fs = false }) { Box(Modifier.padding(12.dp).size(36.dp).background(Color.Black.copy(alpha = .55f), CircleShape), contentAlignment = Alignment.Center) { Icon(Icons.Rounded.Close, null, Modifier.size(20.dp), tint = Color.White) } }
                    Box(Modifier.align(Alignment.BottomCenter).fillMaxWidth().background(androidx.compose.ui.graphics.Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = .6f)))).let { if (full) it.navigationBarsPadding() else it }.padding(12.dp, 18.dp, 8.dp, 8.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Tap(onTap = { tick++; if (playing) p.pause() else p.play() }) { Icon(if (playing) Icons.Rounded.Pause else Icons.Rounded.PlayArrow, null, Modifier.padding(4.dp).size(26.dp), tint = Color.White) }
                            HText(fmt(pos), 11.5f, FontWeight.SemiBold, Color.White, Modifier.padding(start = 4.dp))
                            Box(Modifier.weight(1f).height(28.dp).padding(horizontal = 8.dp)
                                .pointerInput(dur) { detectTapGestures { o -> if (dur > 0) { p.seekTo((dur * (o.x / size.width)).toLong()); tick++ } } }
                                .pointerInput(dur) { detectHorizontalDragGestures(onDragStart = { tick++ }) { c, _ -> if (dur > 0) p.seekTo((dur * (c.position.x / size.width).coerceIn(0f, 1f)).toLong()) } }) {
                                Box(Modifier.align(Alignment.Center).fillMaxWidth().height(3.dp).clip(CircleShape).background(Color.White.copy(alpha = .3f)))
                                Box(Modifier.align(Alignment.CenterStart).fillMaxWidth(if (dur > 0) (pos.toFloat() / dur).coerceIn(0f, 1f) else 0f).height(3.dp).clip(CircleShape).background(Color.White))
                            }
                            HText(fmt(dur), 11.5f, FontWeight.SemiBold, Color.White.copy(alpha = .8f), Modifier.padding(end = 6.dp))
                            Tap(onTap = { tick++; val n = when (speed) { 1f -> 1.5f; 1.5f -> 2f; 2f -> .75f; else -> 1f }; speed = n; p.setPlaybackSpeed(n) }) {
                                Box(Modifier.padding(horizontal = 2.dp).clip(RoundedCornerShape(50)).background(Color.White.copy(alpha = .2f)).padding(8.dp, 4.dp)) { HText((if (speed == 1f) "1" else if (speed == 2f) "2" else speed.toString()) + "×", 11.5f, FontWeight.ExtraBold, Color.White) }
                            }
                            Tap(onTap = { tick++; muted = !muted; p.volume = if (muted) 0f else 1f }) { Icon(if (muted) Icons.Rounded.VolumeOff else Icons.Rounded.VolumeUp, null, Modifier.padding(4.dp).size(22.dp), tint = Color.White) }
                            Tap(onTap = { tick++; fs = !fs }) { Icon(if (full) Icons.Rounded.FullscreenExit else Icons.Rounded.Fullscreen, null, Modifier.padding(4.dp).size(24.dp), tint = Color.White) }
                        }
                    }
                }
            }
        }
    }

    BoxWithConstraints(Modifier.fillMaxWidth().padding(top = 10.dp, end = 8.dp)) {
        val w = if (maxWidth < (maxH * r).dp) maxWidth else (maxH * r).dp
        Box(Modifier.width(w).aspectRatio(r).clip(RoundedCornerShape(20.dp)).background(soft()), contentAlignment = Alignment.Center) {
            if (poster != null && (player == null || failed)) ImgR(proxied(poster), Modifier.fillMaxSize()) { ratio = it }
            if (player != null && !failed) {
                AndroidView(factory = { PlayerView(it).apply { this.player = player; useController = false; resizeMode = androidx.media3.ui.AspectRatioFrameLayout.RESIZE_MODE_ZOOM; setShutterBackgroundColor(android.graphics.Color.TRANSPARENT) } },
                    modifier = Modifier.fillMaxSize(), update = { it.player = if (fs) null else player })
                LaunchedEffect(player) {
                    try { Store.stop(); player.setMediaItem(MediaItem.fromUri(url)); player.repeatMode = androidx.media3.common.Player.REPEAT_MODE_ONE; player.prepare(); player.play() } catch (_: Exception) { failed = true }
                }
                LaunchedEffect(player) { while (true) { pos = player.currentPosition; dur = player.duration.coerceAtLeast(0L); kotlinx.coroutines.delay(250) } }
                DisposableEffect(player) {
                    val l = object : androidx.media3.common.Player.Listener {
                        override fun onPlayerError(e: androidx.media3.common.PlaybackException) { failed = true }
                        override fun onIsPlayingChanged(p: Boolean) { playing = p }
                        override fun onPlaybackStateChanged(st: Int) { buffering = st == androidx.media3.common.Player.STATE_BUFFERING }
                        override fun onVideoSizeChanged(v: androidx.media3.common.VideoSize) { if (v.width > 0 && v.height > 0) ratio = v.width * v.pixelWidthHeightRatio / v.height }
                    }
                    player.addListener(l); onDispose { player.removeListener(l) }
                }
                LaunchedEffect(show, playing, tick) { if (show && playing) { kotlinx.coroutines.delay(2600); show = false } }
                if (!fs) Ctl(player, false)
            } else {
                if (!failed) HText(Store.t("ext_note").replace("{h}", host), 11.5f, color = Color.White.copy(alpha = .75f), align = TextAlign.Center, modifier = Modifier.align(Alignment.BottomCenter).padding(14.dp, 0.dp, 14.dp, 10.dp))
                if (failed) Tap(onTap = { openLink(orig ?: url) }) { Icon(Icons.Rounded.OpenInNew, null, Modifier.size(34.dp), tint = if (poster != null) Color.White else sub()) }
                else Tap(onTap = { started = true }) { Box(Modifier.size(58.dp).background(Color.Black.copy(alpha = .45f), CircleShape), contentAlignment = Alignment.Center) { Icon(Icons.Rounded.PlayArrow, null, Modifier.size(38.dp), tint = Color.White) } }
            }
        }
    }
    if (fs && player != null) androidx.compose.ui.window.Dialog(onDismissRequest = { fs = false }, properties = androidx.compose.ui.window.DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
        Box(Modifier.fillMaxSize().background(Color.Black)) {
            AndroidView(factory = { PlayerView(it).apply { this.player = player; useController = false; resizeMode = androidx.media3.ui.AspectRatioFrameLayout.RESIZE_MODE_FIT; setShutterBackgroundColor(android.graphics.Color.TRANSPARENT) } }, modifier = Modifier.fillMaxSize())
            Ctl(player, true)
        }
    }
}

/** Lajur media yang digeser ke samping (seperti Threads): item tunggal selebar penuh, banyak item ±82%. Halaman biasa (kartu URL) ditaruh setelah media. */
@Composable fun MediaStrip(items: List<String>) {
    if (items.isEmpty()) return
    var order by remember(items) { mutableStateOf(items) }
    LaunchedEffect(items) {
        if (items.size > 1) {
            val media = ArrayList<String>(); val pages = ArrayList<String>()
            for (u in items) {
                if (kindOfUrl(u) != UrlKind.Page || embedOf(u) != null) { media.add(u); continue }
                val p = fetchPreview(u)
                val isM = p != null && (p.optString("video").isNotEmpty() || p.optString("kind") in listOf("image", "video", "audio"))
                if (isM || (p == null && socialHost(u))) media.add(u) else pages.add(u)
            }
            order = media + pages
        }
    }
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        if (order.size == 1) LinkEmbed(order[0]) else {
            val w = maxWidth * .82f
            androidx.compose.foundation.lazy.LazyRow(Modifier.fillMaxWidth()) {
                items(order, key = { it }) { u -> Box(Modifier.width(w)) { LinkEmbed(u) } }
            }
        }
    }
}

private fun isMediaUrl(u: String) = kindOfUrl(u) != UrlKind.Page || embedOf(u) != null || socialHost(u)

/** Semua bagian teks yang disembunyikan: URL kutipan post Hulhup dan setiap URL media (tampil langsung di lajur). */
fun hiddenRanges(text: String): List<QuoteRef> {
    val out = ArrayList<QuoteRef>()
    quoteRef(text)?.let { out.add(it) }
    for (m in linkRe.findAll(text)) {
        val raw = trimLink(m.value); if (raw.isEmpty() || raw.startsWith("@")) continue
        val u = linkUri(raw)?.toString() ?: continue
        if (kindOfUrl(u) == UrlKind.Image && Store.me == null) continue
        if (isMediaUrl(u) && out.none { it.at == m.range.first }) out.add(QuoteRef(0, m.range.first, raw.length))
    }
    return out.sortedBy { it.at }
}

/** Urutan tampil: field media dulu, lalu semua URL di teks post (selain kutipan Hulhup), tanpa duplikat. */
fun postMedia(text: String, media: List<String>): List<String> {
    val q = quoteRef(text); val out = LinkedHashSet<String>(); out.addAll(media)
    for (m in linkRe.findAll(text)) {
        val raw = trimLink(m.value); if (raw.isEmpty() || raw.startsWith("@")) continue
        if (q != null && m.range.first == q.at) continue
        val u = linkUri(raw)?.toString() ?: continue
        if (kindOfUrl(u) == UrlKind.Image && Store.me == null) continue
        out.add(u)
    }
    return out.toList()
}

/** Editor media di layar tulis: ubin yang digeser ke samping, bisa ditambah, dihapus, dan diurutkan. */
@Composable fun MediaEditor(media: androidx.compose.runtime.snapshots.SnapshotStateList<String>, enabled: Boolean = true) {
    val s = Store
    var adding by remember { mutableStateOf(false) }; var v by remember { mutableStateOf("") }
    fun commit() {
        val u = linkUri(trimLink(v.trim()))?.toString()
        if (u == null) { toast(s.t("media_bad"), true); return }
        if (media.contains(u)) { toast(s.t("media_dup"), true); return }
        media.add(u); v = ""; adding = false
    }
    Column(Modifier.fillMaxWidth().padding(bottom = 14.dp)) {
        HText(s.t("media_title"), 14f, FontWeight.Bold, modifier = Modifier.padding(start = 6.dp, bottom = 8.dp))
        androidx.compose.foundation.lazy.LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            items(media.size) { i ->
                val u = media[i]; val k = kindOfUrl(u); val host = (linkUri(u)?.host ?: "").removePrefix("www.")
                Box(Modifier.size(112.dp).clip(RoundedCornerShape(18.dp)).background(soft()).border(1.dp, ink().copy(alpha = .08f), RoundedCornerShape(18.dp))) {
                    if (k == UrlKind.Image) Img(proxied(u), Modifier.fillMaxSize())
                    else Column(Modifier.align(Alignment.Center).padding(8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(when (k) { UrlKind.Video -> Icons.Rounded.Videocam; UrlKind.Audio -> Icons.Rounded.MusicNote; else -> Icons.Rounded.Link }, null, Modifier.size(26.dp), tint = ink())
                        HText(host, 11f, FontWeight.SemiBold, sub(), Modifier.padding(top = 4.dp), maxLines = 2, align = TextAlign.Center, overflow = TextOverflow.Ellipsis)
                    }
                    Box(Modifier.align(Alignment.TopStart).padding(6.dp).size(22.dp).background(Color.Black.copy(alpha = .6f), CircleShape), contentAlignment = Alignment.Center) { HText("${i + 1}", 11f, FontWeight.ExtraBold, Color.White) }
                    Tap(Modifier.align(Alignment.TopEnd), onTap = if (enabled) ({ media.removeAt(i) }) else null) {
                        Box(Modifier.padding(6.dp).size(24.dp).background(Color.Black.copy(alpha = .6f), CircleShape), contentAlignment = Alignment.Center) { Icon(Icons.Rounded.Close, null, Modifier.size(15.dp), tint = Color.White) }
                    }
                    Row(Modifier.align(Alignment.BottomCenter).padding(bottom = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (i > 0) Tap(onTap = { val t = media[i]; media[i] = media[i - 1]; media[i - 1] = t }) { Box(Modifier.size(26.dp).background(Color.Black.copy(alpha = .6f), CircleShape), contentAlignment = Alignment.Center) { Icon(Icons.Rounded.ChevronLeft, null, Modifier.size(18.dp), tint = Color.White) } }
                        if (i < media.size - 1) Tap(onTap = { val t = media[i]; media[i] = media[i + 1]; media[i + 1] = t }) { Box(Modifier.size(26.dp).background(Color.Black.copy(alpha = .6f), CircleShape), contentAlignment = Alignment.Center) { Icon(Icons.Rounded.ChevronRight, null, Modifier.size(18.dp), tint = Color.White) } }
                    }
                }
            }
            item {
                Tap(onTap = if (enabled) ({ adding = true }) else null) {
                    Column(Modifier.size(112.dp).clip(RoundedCornerShape(18.dp)).border(1.5.dp, ink().copy(alpha = .18f), RoundedCornerShape(18.dp)), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(Icons.Rounded.Add, null, Modifier.size(28.dp), tint = ink())
                        HText(s.t("media_add"), 13f, FontWeight.Bold, modifier = Modifier.padding(top = 2.dp))
                    }
                }
            }
        }
        if (adding) Row(Modifier.padding(top = 10.dp).fillMaxWidth().background(soft(), RoundedCornerShape(18.dp)).padding(16.dp, 4.dp, 6.dp, 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f).padding(vertical = 12.dp)) {
                if (v.isEmpty()) HText(s.t("media_url_ph"), 14.5f, color = sub(), maxLines = 1)
                androidx.compose.foundation.text.BasicTextField(v, { v = it }, Modifier.fillMaxWidth(), singleLine = true, textStyle = androidx.compose.ui.text.TextStyle(fontSize = 14.5.sp, color = ink(), fontFamily = Outfit), cursorBrush = androidx.compose.ui.graphics.SolidColor(ink()),
                    keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Uri, imeAction = androidx.compose.ui.text.input.ImeAction.Done), keyboardActions = androidx.compose.foundation.text.KeyboardActions(onDone = { commit() }))
            }
            Tap(onTap = { commit() }) { Icon(Icons.Rounded.Check, null, Modifier.padding(10.dp).size(22.dp), tint = ink()) }
            Tap(onTap = { adding = false; v = "" }) { Icon(Icons.Rounded.Close, null, Modifier.padding(10.dp).size(20.dp), tint = sub()) }
        }
        HText(s.t("media_sub"), 12.5f, color = sub(), modifier = Modifier.padding(start = 6.dp, top = 8.dp))
    }
}

/** Audio dari URL: memakai pemutar Hulhup yang sama (satu suara pada satu waktu). */
@Composable private fun AudioEmbed(url: String, host: String) {
    val key = -(url.hashCode() and 0x3fffffff) - 1000
    val name = try { Uri.decode(Uri.parse(url).lastPathSegment ?: host) } catch (_: Exception) { host }
    Column(Modifier.padding(end = 8.dp)) {
        FileBar(key, url, 0)
        HText("$name · ${Store.t("ext_note").replace("{h}", host)}", 11.5f, color = sub(), modifier = Modifier.padding(6.dp, 4.dp, 0.dp, 0.dp), maxLines = 2, overflow = TextOverflow.Ellipsis)
    }
}

// ───────── kutipan post Hulhup (seperti Threads) ─────────
/** Posisi dan id post Hulhup pertama yang ditempel sebagai tautan (hulhup.my.id/p/<kode> atau id angka), atau null. */
class QuoteRef(val id: Int, val at: Int, val len: Int)
fun quoteRef(text: String): QuoteRef? {
    if (text.isEmpty() || !text.contains("hulhup.my.id/p/", ignoreCase = true)) return null
    for (m in linkRe.findAll(text)) {
        val raw = trimLink(m.value); val u = linkUri(raw) ?: continue
        val h = (u.host ?: "").lowercase(); if (h != "hulhup.my.id" && h != "www.hulhup.my.id") continue
        val seg = (u.path ?: "").split('/').filter { it.isNotEmpty() }; if (seg.size != 2 || seg[0] != "p") continue
        val id = if (Regex("^\\d{1,9}$").matches(seg[1])) seg[1].toLong() else PostCode.dec(seg[1])
        if (id != null && id > 0 && id <= Int.MAX_VALUE) return QuoteRef(id.toInt(), m.range.first, raw.length)
    }
    return null
}

private val quoteCache = HashMap<String, A?>()
private val quoteFlight = HashMap<String, kotlinx.coroutines.Deferred<A?>>()
/** Satu permintaan per post dan akun; jalan di appScope supaya tidak ikut batal saat kartu keluar layar. */
private suspend fun fetchQuote(id: Int): A? {
    val key = "$id:${Store.me?.username ?: ""}"
    if (quoteCache.containsKey(key)) return quoteCache[key]
    val d = quoteFlight.getOrPut(key) {
        appScope.async {
            val r = try { A(Api.req("GET", "/posts/$id").getJSONObject("post")) } catch (e: java.io.IOException) { quoteFlight.remove(key); return@async null } catch (_: Exception) { null }
            quoteCache[key] = r; quoteFlight.remove(key); r
        }
    }
    return d.await()
}

/** Kutipan post Hulhup di dalam post lain: langsung tampil tanpa diketuk; ketuk membuka post aslinya. */
@Composable fun QuoteCard(id: Int) {
    val s = Store
    var a by remember(id, s.me?.username) { mutableStateOf<A?>(null) }; var done by remember(id, s.me?.username) { mutableStateOf(false) }
    LaunchedEffect(id, s.me?.username) { a = fetchQuote(id); done = true }
    val shape = RoundedCornerShape(20.dp)
    val q = a
    if (!done) { Box(Modifier.padding(top = 10.dp, end = 8.dp).fillMaxWidth().height(112.dp).clip(shape).background(soft())); return }
    if (q == null) {
        Row(Modifier.padding(top = 10.dp, end = 8.dp).fillMaxWidth().clip(shape).background(soft()).border(1.dp, ink().copy(alpha = .1f), shape).padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.Lock, null, Modifier.size(18.dp), tint = sub()); Spacer(Modifier.width(8.dp)); HText(s.t("quote_na"), 14f, FontWeight.SemiBold, sub())
        }
        return
    }
    val raw = (q.text ?: q.desc).trim()
    val text = remember(raw) { hiddenRanges(raw).sortedByDescending { it.at }.fold(raw) { acc, r -> acc.substring(0, r.at).trimEnd() + acc.substring(r.at + r.len).trimStart().let { x -> if (x.isEmpty()) "" else "\n$x" } }.trim() }
    val qMedia = remember(raw, q.media) { postMedia(raw, q.media).filter { quoteRef(it) == null } }
    Tap(Modifier.padding(top = 10.dp, end = 8.dp), .99f, onTap = { openPost(q) }) {
        Column(Modifier.fillMaxWidth().wrapContentHeight().clip(shape).border(1.dp, ink().copy(alpha = .14f), shape).padding(14.dp, 12.dp, 14.dp, 10.dp)) {
            if (q.pprof) Row(verticalAlignment = Alignment.CenterVertically) {
                Avatar(q.ownerAvatar, q.ownerName, 26.dp); Spacer(Modifier.width(8.dp))
                HText(q.ownerName, 14.5f, FontWeight.ExtraBold, maxLines = 1, modifier = Modifier.weight(1f, fill = false))
                if (q.ownerVerified) Icon(Icons.Rounded.Verified, null, Modifier.padding(start = 4.dp).size(14.dp), tint = badgeTint(q.owner))
                HText("  ${q.owner} · ${s.`when`(q.created)}", 13f, color = sub(), maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
            }
            if (text.isNotEmpty()) HText(text.trimEnd(), 15f, modifier = Modifier.padding(top = 8.dp), maxLines = 6, overflow = TextOverflow.Ellipsis, lh = 21f)
            if (qMedia.isNotEmpty()) Box(Modifier.fillMaxWidth().padding(top = 8.dp).wrapContentHeight().clipToBounds()) { MediaStrip(qMedia) }
            if (q.files.isNotEmpty() && !q.bgm) Box(Modifier.padding(top = 4.dp)) { FileBar(fileKey(q, 0), q.files[0].optString("url"), q.files[0].optInt("secs")) { Store.countPlay(q) } }
            Row(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(18.dp), verticalAlignment = Alignment.CenterVertically) {
                Row(verticalAlignment = Alignment.CenterVertically) { HIcon(HK.sorot, size = 16.dp, color = sub()); Spacer(Modifier.width(5.dp)); HText("${q.likes}", 13f, FontWeight.SemiBold, sub()) }
                Row(verticalAlignment = Alignment.CenterVertically) { HIcon(HK.comment, size = 16.dp, color = sub()); Spacer(Modifier.width(5.dp)); HText("${q.comments}", 13f, FontWeight.SemiBold, sub()) }
            }
        }
    }
}

// ───────── sematan situs populer (YouTube, Instagram, TikTok, Vimeo, Spotify, SoundCloud) ─────────
class FrameSpec(val src: String, val ratio: Float?, val h: Int?, val host: String)
fun embedOf(url: String): FrameSpec? {
    val u = linkUri(url) ?: return null
    val h = (u.host ?: "").lowercase().replace(Regex("^(www|m|mobile|music)\\."), ""); val seg = (u.path ?: "").split('/').filter { it.isNotEmpty() }
    fun ok(x: String?) = x != null && Regex("^[\\w-]{5,40}$").matches(x)
    val yt = "https://www.youtube-nocookie.com/embed/"
    if (h == "youtu.be" && ok(seg.getOrNull(0))) return FrameSpec("$yt${seg[0]}?rel=0&playsinline=1", 16f / 9, null, "YouTube")
    if (h == "youtube.com") {
        val v = u.getQueryParameter("v")
        if (seg.getOrNull(0) == "watch" && ok(v)) return FrameSpec("$yt$v?rel=0&playsinline=1", 16f / 9, null, "YouTube")
        if (seg.getOrNull(0) in listOf("shorts", "embed", "live") && ok(seg.getOrNull(1))) return FrameSpec("$yt${seg[1]}?rel=0&playsinline=1", if (seg[0] == "shorts") 9f / 16 else 16f / 9, null, "YouTube")
    }
    if (h == "vimeo.com" && Regex("^\\d{5,12}$").matches(seg.getOrNull(0) ?: "")) return FrameSpec("https://player.vimeo.com/video/${seg[0]}", 16f / 9, null, "Vimeo")
    if (h == "open.spotify.com") {
        val j = if (seg.getOrNull(0)?.startsWith("intl-") == true) 1 else 0; val t = seg.getOrNull(j); val id = seg.getOrNull(j + 1)
        if (t in listOf("track", "album", "playlist", "episode", "show", "artist") && ok(id)) return FrameSpec("https://open.spotify.com/embed/$t/$id", null, if (t == "track" || t == "episode") 152 else 352, "Spotify")
    }
    if (h == "soundcloud.com" && seg.size >= 2) return FrameSpec("https://w.soundcloud.com/player/?url=${Uri.encode("https://soundcloud.com" + u.path)}&color=%236d4aff&visual=false", null, 166, "SoundCloud")
    return null
}

/** Situs sosial yang medianya diambil server (og:video / sematan resmi) dan tampil sebagai pemutar atau kartu. */
fun socialHost(url: String): Boolean {
    val h = (linkUri(url)?.host ?: "").lowercase()
    return listOf("instagram.com", "tiktok.com", "facebook.com", "fb.watch", "threads.net", "threads.com", "x.com", "twitter.com").any { h == it || h.endsWith(".$it") }
}
/** Tautan media pertama di teks (foto/video/audio langsung atau sematan situs): disembunyikan karena medianya tampil langsung. */
fun mediaRef(text: String, images: Boolean = true): QuoteRef? {
    for (m in linkRe.findAll(text)) {
        val raw = trimLink(m.value); if (raw.isEmpty() || raw.startsWith("@")) continue
        val u = linkUri(raw)?.toString() ?: continue
        val k = kindOfUrl(u); if (k == UrlKind.Image && !images) return null
        return if (k != UrlKind.Page || embedOf(u) != null || socialHost(u)) QuoteRef(0, m.range.first, raw.length) else null
    }
    return null
}
/** Bagian teks yang disembunyikan: URL kutipan post Hulhup, atau URL media yang tampil langsung. */
fun hiddenRef(text: String): QuoteRef? = quoteRef(text) ?: mediaRef(text, Store.me != null)

@SuppressLint("SetJavaScriptEnabled")
@Composable private fun FrameEmbed(e: FrameSpec, url: String) {
    val holder = remember { arrayOfNulls<WebView>(1) }
    DisposableEffect(Unit) { onDispose { holder[0]?.let { try { it.stopLoading(); it.loadUrl("about:blank"); it.destroy() } catch (_: Exception) {} }; holder[0] = null } }
    val shape = RoundedCornerShape(20.dp)
    val base = Modifier.padding(top = 10.dp, end = 8.dp).fillMaxWidth().clip(shape).background(soft())
    val sized = if (e.ratio != null) base.aspectRatio(e.ratio) else base.height(e.h!!.dp)
    val html = remember(e.src) { "<!doctype html><html><head><meta name=viewport content=\"width=device-width,initial-scale=1\"><style>html,body{margin:0;height:100%;background:transparent;overflow:hidden}iframe{border:0;width:100%;height:100%}</style></head><body><iframe src=\"${e.src}\" allow=\"autoplay; encrypted-media; fullscreen; picture-in-picture\" allowfullscreen referrerpolicy=\"strict-origin-when-cross-origin\"></iframe></body></html>" }
    Box(sized) {
        AndroidView(modifier = Modifier.fillMaxSize(), factory = { ctx ->
            WebView(ctx).apply {
                holder[0] = this
                settings.javaScriptEnabled = true; settings.domStorageEnabled = true; settings.mediaPlaybackRequiresUserGesture = true
                settings.javaScriptCanOpenWindowsAutomatically = false; settings.setSupportMultipleWindows(false)
                isVerticalScrollBarEnabled = false; isHorizontalScrollBarEnabled = false; overScrollMode = android.view.View.OVER_SCROLL_NEVER
                setBackgroundColor(0)
                webChromeClient = WebChromeClient()
                webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(v: WebView, r: WebResourceRequest): Boolean {
                        if (!r.isForMainFrame) return false
                        val s = r.url.toString(); if (s.startsWith("about:")) return false
                        openLink(url); return true
                    }
                }
                loadDataWithBaseURL("https://hulhup.my.id", html, "text/html", "utf-8", null)
            }
        })
    }
}

/** Cadangan bila pratinjau situs sosial tidak bisa diambil: kartu kecil yang membuka tautan aslinya. */
@Composable private fun OpenCard(url: String, host: String) {
    val shape = RoundedCornerShape(20.dp)
    Tap(Modifier.padding(top = 10.dp, end = 8.dp), .99f, onTap = { openLink(url) }) {
        Row(Modifier.fillMaxWidth().clip(shape).border(1.dp, ink().copy(alpha = .1f), shape).padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Rounded.OpenInNew, null, Modifier.size(20.dp), tint = sub()); Spacer(Modifier.width(10.dp)); HText(host, 14.5f, FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}
