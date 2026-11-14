package app.misyi.hulhup

import android.media.MediaRecorder
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AudioFile
import androidx.compose.material.icons.rounded.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.*
import org.json.JSONObject
import java.io.File
import kotlin.math.PI
import kotlin.math.min
import kotlin.math.sin

/** Satu klip audio yang direkam atau dipilih (maksimal 15 detik). */
class AudioClip(val bytes: ByteArray, val ext: String, val ms: Int) { val secs get() = Math.ceil(ms / 1000.0).toInt().coerceIn(1, 15) }

suspend fun shareUrl(u: String) { Plat.share(u) }

suspend fun sharePost(a: A) {
    val head = if (a.desc.trim().isEmpty()) "" else "${a.desc.trim()}${if (a.long) "…" else ""}\n\n"
    Plat.share("$head${postLink(a.id)}")
}

suspend fun savePost(a: A) {
    val s = Store
    if (s.me == null) { toast(s.t("need_login")); return }
    try {
        val j = Api.req("POST", "/audios/${a.id}/save")
        a.saved = j.optBoolean("saved"); s.poke(); toast(s.t(if (a.saved) "saved_post" else "unsaved_post"))
    } catch (e: Exception) { toast(s.err(e), true) }
}

fun openPost(a: A) { Nav.go(Screen("/p/${PostCode.enc(a.id.toLong())}") { PostPage(a.id, seed = a) }) }

// ---------- perekam (lembar bawah) ----------
@Composable fun RecordSheet(done: (AudioClip?) -> Unit) {
    val s = Store; val sc = rememberCoroutineScope()
    var bytes by remember { mutableStateOf<ByteArray?>(null) }
    var ext by remember { mutableStateOf("m4a") }
    var ms by remember { mutableIntStateOf(0) }
    var recording by remember { mutableStateOf(false) }
    var previewing by remember { mutableStateOf(false) }
    var rec by remember { mutableStateOf<MediaRecorder?>(null) }
    var file by remember { mutableStateOf<File?>(null) }
    var job by remember { mutableStateOf<Job?>(null) }
    DisposableEffect(Unit) { onDispose { job?.cancel(); try { rec?.release() } catch (_: Exception) {}; Store.stop() } }

    suspend fun stop() {
        job?.cancel()
        try { rec?.stop() } catch (_: Exception) {}
        try { rec?.release() } catch (_: Exception) {}
        rec = null; ext = "m4a"
        bytes = try { file?.readBytes() } catch (_: Exception) { null }
        recording = false
    }
    suspend fun start() {
        if (recording) { stop(); return }
        try {
            if (!Plat.micPermission()) { toast(s.t("mic_denied"), true); return }
            val f = File(Store.app.cacheDir, "h${System.currentTimeMillis()}.m4a"); file = f
            @Suppress("DEPRECATION") val r = if (android.os.Build.VERSION.SDK_INT >= 31) MediaRecorder(Store.app) else MediaRecorder()
            r.setAudioSource(MediaRecorder.AudioSource.MIC); r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC); r.setAudioChannels(1); r.setAudioEncodingBitRate(64000); r.setAudioSamplingRate(44100)
            r.setOutputFile(f.absolutePath); r.prepare(); r.start(); rec = r
            if (previewing) { Store.stop(); previewing = false }
            recording = true; ms = 0; bytes = null
            val t0 = System.currentTimeMillis()
            job = sc.launch { while (true) { delay(100); ms = (System.currentTimeMillis() - t0).toInt().coerceIn(0, 15000); if (ms >= 15000) { stop(); break } } }
        } catch (_: Exception) { toast(s.t("e_server"), true) }
    }
    suspend fun pick() {
        val r = Plat.pickFile(arrayOf("audio/*")) ?: return
        if (r.first.size > 1024 * 1024) { toast(s.t("e_too_big"), true); return }
        val secs = Plat.audioSecs(r.first, r.second)
        if (secs == null) { toast(s.t("e_bad_file"), true); return }
        if (secs > 15) { toast(s.t("too_long"), true); return }
        Store.stop()
        bytes = r.first; ext = r.second.lowercase(); ms = (if (secs < 1) 1 else secs) * 1000; previewing = false
    }
    suspend fun preview() {
        val b = bytes ?: return
        if (previewing) { Store.stop(); previewing = false; return }
        previewing = true
        try { Store.playBytes(-777, b, loop = false) { previewing = false } } catch (_: Exception) { previewing = false }
    }

    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        HText(s.t("rec_title"), 18f, FontWeight.ExtraBold)
        Spacer(Modifier.height(18.dp))
        val sz by animateDpAsState(if (recording) 84.dp else 112.dp, tween(300), label = "rs")
        val rad by animateDpAsState(if (recording) 26.dp else 56.dp, tween(300), label = "rr")
        Tap(onTap = { sc.launch { start() } }) { Box(Modifier.size(sz).background(if (recording) Heart else btnBg(), RoundedCornerShape(rad)), contentAlignment = Alignment.Center) { Icon(if (recording) Icons.Rounded.Stop else Icons.Rounded.Mic, null, Modifier.size(40.dp), tint = Cream) } }
        Spacer(Modifier.height(14.dp))
        HText("${mmss(ms / 1000)} / 0:15", 18f, FontWeight.ExtraBold)
        Spacer(Modifier.height(4.dp))
        Box(Modifier.padding(horizontal = 8.dp).fillMaxWidth().height(5.dp).background(ink().copy(alpha = .12f), RoundedCornerShape(4.dp))) { Box(Modifier.fillMaxWidth(ms / 15000f).fillMaxHeight().background(if (recording) Heart else ink(), RoundedCornerShape(4.dp))) }
        Spacer(Modifier.height(6.dp))
        HText(s.t("rec_hint"), 13f, color = sub(), align = TextAlign.Center)
        Spacer(Modifier.height(16.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            PBtn(s.t("pick"), if (recording) null else ({ sc.launch { pick() } }), ghost = true, icon = Icons.Outlined.AudioFile, modifier = Modifier.weight(1f))
            if (bytes != null && !recording) PBtn(s.t("preview"), { sc.launch { preview() } }, ghost = true, icon = if (previewing) Icons.Rounded.Pause else Icons.Rounded.PlayArrow, modifier = Modifier.weight(1f))
        }
        Spacer(Modifier.height(10.dp))
        PBtn(s.t("use_audio"), if (bytes == null || recording) null else ({ val b = bytes!!; if (b.size > 1024 * 1024) toast(s.t("rec_over"), true) else done(AudioClip(b, ext, ms)) }), icon = Icons.Rounded.Check)
    }
}

// ---------- pemutar kecil ----------
fun fileKey(a: A, i: Int) = if (i == 0) a.id else -(a.id * 20 + i)
fun bgmUrl(a: A) = a.files[a.bgmIdx.coerceIn(0, a.files.size - 1)].optString("url")

/** Audio sebuah post, dengan tanda bila terdeteksi buatan AI. */
@Composable fun AudioBars(a: A, scope: Any?) = Column {
    a.files.forEachIndexed { i, f -> FileBar(fileKey(a, i), f.optString("url"), f.optInt("secs"), scope) { Store.countPlay(a) } }
    if (a.ai) AiTag(Store.t(if (a.aiKind == "edited") "ai_audio_edit" else "ai_audio"))
}

/** Gelombang suara khas Hulhup: tinggi batang diturunkan dari kunci audio, jadi tiap post punya bentuknya sendiri. */
fun waveShape(seed: Int, n: Int): List<Double> {
    var x = ((seed.toLong() * 2654435761L + 40503L) and 0x7fffffff)
    fun rnd(): Double { x = (x * 1103515245L + 12345L) and 0x7fffffff; return x.toDouble() / 0x7fffffff }
    val raw = List(n) { rnd() }
    return List(n) { i ->
        val a = raw[i]; val b = raw[(i + 1) % n]; val c = raw[(i + n - 1) % n]
        val env = .55 + .45 * sin(PI * (i + .5) / n)
        (.18 + .82 * (a * .6 + b * .2 + c * .2)) * env
    }
}

@Composable fun Wave(seed: Int, progress: Float, played: Color, rest: Color, now: Color, modifier: Modifier) {
    Canvas(modifier) {
        val gap = 3.dp.toPx(); val w = 3.dp.toPx()
        val n = ((size.width + gap) / (w + gap)).toInt().coerceIn(8, 80)
        val hs = waveShape(seed, n); val cur = (progress * n).toInt()
        for (i in 0 until n) {
            val h = (size.height * hs[i]).toFloat().coerceIn(4.dp.toPx(), size.height)
            drawRoundRect(if (progress <= 0f) rest else if (i < cur) played else if (i == cur) now else rest, Offset(i * (w + gap), (size.height - h) / 2), Size(w, h), CornerRadius(2.dp.toPx()))
        }
    }
}

/** Pemutar satu audio: tombol putar, gelombang suara, waktu, dan kecepatan (0.5×–2×). */
@Composable fun FileBar(keyId: Int, url: String, secs: Int, scope: Any? = null, onStart: (() -> Unit)? = null) {
    val s = Store; val sc = rememberCoroutineScope(); s.rev
    val on = s.playing == keyId
    val ms = s.posMs
    val total = (if (on && s.dur > 0) s.dur else if (secs > 0) secs * 1000 else 15000).coerceAtLeast(1)
    Row(Modifier.padding(top = 10.dp).fillMaxWidth().border(if (on) 1.4.dp else 1.dp, ink().copy(alpha = if (on) .5f else .12f), RoundedCornerShape(16.dp)).padding(8.dp, 8.dp, 12.dp, 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Tap(onTap = { if (!on) onStart?.invoke(); sc.launch { try { s.playUrl(keyId, url, scope = scope) } catch (_: Exception) { toast(s.t("e_server"), true) } } }) {
            val r by animateDpAsState(if (on) 12.dp else 20.dp, tween(220), label = "fb")
            Box(Modifier.size(40.dp).background(if (on) Brand else btnBg(), RoundedCornerShape(r)), contentAlignment = Alignment.Center) { Icon(if (on) Icons.Rounded.Pause else Icons.Rounded.PlayArrow, null, Modifier.size(22.dp), tint = if (on) Color.White else Cream) }
        }
        Spacer(Modifier.width(12.dp))
        Wave(keyId, if (on) (ms.toFloat() / total).coerceIn(0f, 1f) else 0f, ink(), ink().copy(alpha = .2f), Brand, Modifier.weight(1f).height(32.dp))
        Spacer(Modifier.width(10.dp))
        HText(if (on) mmss(ms / 1000) else if (secs > 0) mmss(secs) else "·", 12.5f, FontWeight.Bold, if (on) ink() else sub())
        Spacer(Modifier.width(6.dp))
        Tap(scale = .92f, onTap = { s.cycleRate() }) { HText(rateText(s.rate), 12f, FontWeight.ExtraBold, if (s.rate == 1.0f) sub() else acc(), modifier = Modifier.padding(horizontal = 4.dp, vertical = 6.dp)) }
    }
}
fun rateText(r: Float): String = if (r == Math.round(r).toFloat()) "${r.toInt()}×" else "${r.toString().trimEnd('0')}×"

/** Penanda untuk audio yang terdeteksi buatan AI. */
@Composable fun AiTag(label: String) {
    val pink = Color(0xFFD6336C)
    Row(Modifier.padding(top = 8.dp)) {
        Row(Modifier.background(pink.copy(alpha = .12f), RoundedCornerShape(10.dp)).padding(horizontal = 9.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Rounded.AutoAwesome, null, Modifier.size(13.dp), tint = pink); Spacer(Modifier.width(5.dp)); HText(label, 12f, FontWeight.Bold, pink)
        }
    }
}

/** Tempat audio pada form post: kosong = ajakan merekam/memilih; terisi = gelombang + putar + ganti/hapus. */
@Composable fun AudioSlot(clip: AudioClip?, playing: Boolean, onPlay: () -> Unit, onPick: (() -> Unit)?, onClear: () -> Unit) {
    val s = Store
    if (clip == null) {
        Tap(scale = .98f, onTap = onPick) {
            Column(Modifier.fillMaxWidth().border(1.4.dp, ink().copy(alpha = .25f), RoundedCornerShape(20.dp)).padding(vertical = 26.dp, horizontal = 18.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Box(Modifier.size(54.dp).background(btnBg(), CircleShape), contentAlignment = Alignment.Center) { Icon(Icons.Rounded.Mic, null, Modifier.size(26.dp), tint = Cream) }
                Spacer(Modifier.height(12.dp)); HText(s.t("add_audio"), 16f, FontWeight.ExtraBold); Spacer(Modifier.height(3.dp)); HText(s.t("audio_req"), 12.5f, color = sub())
            }
        }
        return
    }
    Row(Modifier.fillMaxWidth().border(1.4.dp, ink().copy(alpha = .5f), RoundedCornerShape(20.dp)).padding(10.dp, 10.dp, 6.dp, 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Tap(onTap = onPlay) { Box(Modifier.size(44.dp).background(if (playing) Brand else btnBg(), RoundedCornerShape(if (playing) 13.dp else 22.dp)), contentAlignment = Alignment.Center) { Icon(if (playing) Icons.Rounded.Pause else Icons.Rounded.PlayArrow, null, Modifier.size(24.dp), tint = if (playing) Color.White else Cream) } }
        Spacer(Modifier.width(12.dp))
        Wave(clip.bytes.size, 0f, ink(), ink().copy(alpha = .35f), Brand, Modifier.weight(1f).height(34.dp))
        Spacer(Modifier.width(10.dp)); HText(mmss(clip.secs), 13.5f, FontWeight.ExtraBold)
        IconBtn(Icons.Rounded.Refresh, color = sub()) { onPick?.invoke() }
        IconBtn(Icons.Rounded.Close, color = sub()) { onClear() }
    }
}

/** Penanda backsound: audio post yang terputar otomatis saat post terlihat. Pembaca bisa mematikannya. */
@Composable fun BgmBar(a: A) {
    val s = Store; val sc = rememberCoroutineScope(); s.rev
    val live = s.bgmKey == a.id && !s.bgmMuted
    Row(Modifier.padding(top = 8.dp).fillMaxWidth().background(soft(), RoundedCornerShape(24.dp)).padding(14.dp, 8.dp, 6.dp, 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(Icons.Rounded.MusicNote, null, Modifier.size(18.dp), tint = if (live) acc() else sub()); Spacer(Modifier.width(8.dp))
        HText(s.t("bgm_tag"), 13.5f, FontWeight.Bold, if (live) ink() else sub(), Modifier.weight(1f))
        Tap(onTap = { s.setBgmMuted(!s.bgmMuted); if (s.bgmKey != a.id && !s.bgmMuted && a.files.isNotEmpty()) sc.launch { s.playBgm(a.id, bgmUrl(a)) } }) {
            Icon(if (s.bgmMuted) Icons.Rounded.VolumeOff else Icons.Rounded.VolumeUp, null, Modifier.padding(8.dp).size(20.dp), tint = if (s.bgmMuted) sub() else ink())
        }
    }
}
