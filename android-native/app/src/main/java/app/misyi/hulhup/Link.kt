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
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
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
    if (k == UrlKind.Video) { VideoEmbed(url); return }
    if (k == UrlKind.Audio) { AudioEmbed(url, host); return }
    var p by remember(url) { mutableStateOf<JSONObject?>(null) }
    LaunchedEffect(url) { p = fetchPreview(url) }
    val pv = p ?: return
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

@Composable private fun ImageEmbed(url: String, orig: String) {
    val host = try { Uri.parse(orig.ifEmpty { url }).host ?: "" } catch (_: Exception) { "" }
    Tap(Modifier.padding(top = 10.dp, end = 8.dp), .99f, onTap = { Nav.go(Screen("image") { ImageViewer(url, host) }) }) {
        Box(Modifier.fillMaxWidth().heightIn(max = 420.dp).clip(RoundedCornerShape(20.dp)).border(1.dp, ink().copy(alpha = .08f), RoundedCornerShape(20.dp))) {
            Img(url, Modifier.fillMaxWidth(), ContentScale.FillWidth)
        }
    }
}

/** Video dari URL: tidak diunduh sampai diketuk (hemat kuota), lalu langsung diputar di tempat. */
@Composable private fun VideoEmbed(url: String) {
    var started by remember { mutableStateOf(false) }; var failed by remember { mutableStateOf(false) }
    val host = (try { Uri.parse(url).host ?: "" } catch (_: Exception) { "" }).removePrefix("www.")
    val ctx = androidx.compose.ui.platform.LocalContext.current
    val player = remember(started) { if (started) ExoPlayer.Builder(ctx).build() else null }
    DisposableEffect(player) { onDispose { player?.release() } }
    Box(Modifier.padding(top = 10.dp, end = 8.dp).fillMaxWidth().aspectRatio(16f / 9f).clip(RoundedCornerShape(20.dp)).background(Color.Black), contentAlignment = Alignment.Center) {
        if (player != null && !failed) {
            AndroidView(factory = { PlayerView(it).apply { this.player = player; useController = true } }, modifier = Modifier.fillMaxSize())
            LaunchedEffect(player) {
                try { Store.stop(); player.setMediaItem(MediaItem.fromUri(url)); player.repeatMode = androidx.media3.common.Player.REPEAT_MODE_ONE; player.prepare(); player.play() } catch (_: Exception) { failed = true }
            }
            DisposableEffect(player) { val l = object : androidx.media3.common.Player.Listener { override fun onPlayerError(e: androidx.media3.common.PlaybackException) { failed = true } }; player.addListener(l); onDispose { player.removeListener(l) } }
        } else {
            if (!failed) HText(Store.t("ext_note").replace("{h}", host), 11.5f, color = Color.White.copy(alpha = .6f), align = TextAlign.Center, modifier = Modifier.align(Alignment.BottomCenter).padding(14.dp, 0.dp, 14.dp, 10.dp))
            if (failed) Tap(onTap = { openLink(url) }) { Icon(Icons.Rounded.OpenInNew, null, Modifier.size(34.dp), tint = Color.White.copy(alpha = .7f)) }
            else Tap(onTap = { started = true }) { Box(Modifier.size(58.dp).background(Color.White.copy(alpha = .24f), CircleShape), contentAlignment = Alignment.Center) { Icon(Icons.Rounded.PlayArrow, null, Modifier.size(38.dp), tint = Color.White) } }
        }
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
            Icon(androidx.compose.material.icons.Icons.Outlined.Lock, null, Modifier.size(18.dp), tint = sub()); Spacer(Modifier.width(8.dp)); HText(s.t("quote_na"), 14f, FontWeight.SemiBold, sub())
        }
        return
    }
    val text = (q.text ?: q.desc).trim()
    Tap(Modifier.padding(top = 10.dp, end = 8.dp), .99f, onTap = { openPost(q) }) {
        Column(Modifier.fillMaxWidth().clip(shape).border(1.dp, ink().copy(alpha = .14f), shape).padding(14.dp, 12.dp, 14.dp, 10.dp)) {
            if (q.pprof) Row(verticalAlignment = Alignment.CenterVertically) {
                Avatar(q.ownerAvatar, q.ownerName, 26.dp); Spacer(Modifier.width(8.dp))
                HText(q.ownerName, 14.5f, FontWeight.ExtraBold, maxLines = 1, modifier = Modifier.weight(1f, fill = false))
                if (q.ownerVerified) Icon(Icons.Rounded.Verified, null, Modifier.padding(start = 4.dp).size(14.dp), tint = Blue)
                HText("  ${q.owner} · ${s.`when`(q.created)}", 13f, color = sub(), maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
            }
            if (text.isNotEmpty()) HText(text.trimEnd(), 15f, modifier = Modifier.padding(top = 8.dp), maxLines = 6, overflow = TextOverflow.Ellipsis, lh = 21f)
            if (q.files.isNotEmpty() && !q.bgm) Box(Modifier.padding(top = 4.dp)) { FileBar(fileKey(q, 0), q.files[0].optString("url"), q.files[0].optInt("secs")) { Store.countPlay(q) } }
            Row(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(18.dp), verticalAlignment = Alignment.CenterVertically) {
                Row(verticalAlignment = Alignment.CenterVertically) { HIcon(HK.sorot, size = 16.dp, color = sub()); Spacer(Modifier.width(5.dp)); HText("${q.likes}", 13f, FontWeight.SemiBold, sub()) }
                Row(verticalAlignment = Alignment.CenterVertically) { HIcon(HK.comment, size = 16.dp, color = sub()); Spacer(Modifier.width(5.dp)); HText("${q.comments}", 13f, FontWeight.SemiBold, sub()) }
            }
        }
    }
}
