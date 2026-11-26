package app.misyi.hulhup

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.Icon
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.composed
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import org.json.JSONObject

/** Pilihan foto/video di penulis post: aktif hanya bila slot global terbuka. */
@Composable fun MediaPickRow(mclip: MediaClip?, prep: Boolean, slot: JSONObject?, onPick: (String) -> Unit, onClear: () -> Unit) {
    val s = Store
    if (mclip != null) {
        Row(Modifier.fillMaxWidth().border(1.4.dp, ink().copy(alpha = .5f), RoundedCornerShape(20.dp)).padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
            if (mclip.bmp != null) Image(mclip.bmp.asImageBitmap(), null, Modifier.size(64.dp).clip(RoundedCornerShape(14.dp)), contentScale = ContentScale.Crop)
            else Box(Modifier.size(64.dp).background(soft(), RoundedCornerShape(14.dp)), contentAlignment = Alignment.Center) { Icon(Icons.Rounded.Videocam, null, Modifier.size(28.dp), tint = ink()) }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                HText(s.t(if (mclip.kind == "image") "media_photo" else "media_video"), 15f, FontWeight.ExtraBold)
                HText((if (mclip.kind == "video") "${mclip.secs} dtk · " else "") + "${mclip.bytes.size / 1024} KB", 12.5f, color = sub())
            }
            IconBtn(Icons.Rounded.Close, color = sub()) { onClear() }
        }
        return
    }
    val open = slot?.optBoolean("open") == true
    Column(Modifier.fillMaxWidth()) {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            for ((k, icon, label) in listOf(Triple("image", Icons.Rounded.Image, "media_photo"), Triple("video", Icons.Rounded.Videocam, "media_video"))) {
                Tap(Modifier.weight(1f), .97f, onTap = if (open && !prep) ({ onPick(k) }) else null) {
                    Row(Modifier.fillMaxWidth().alpha(if (open) 1f else .45f).border(1.4.dp, ink().copy(alpha = .25f), RoundedCornerShape(20.dp)).padding(vertical = 16.dp), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                        if (prep) androidx.compose.material3.CircularProgressIndicator(Modifier.size(20.dp), color = ink(), strokeWidth = 2.dp) else Icon(icon, null, Modifier.size(22.dp), tint = ink())
                        Spacer(Modifier.width(8.dp)); HText(s.t(label), 14.5f, FontWeight.ExtraBold)
                    }
                }
            }
        }
        Row(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            for ((k, label) in listOf("cam_image" to "media_cam_photo", "cam_video" to "media_cam_video")) {
                Tap(Modifier.weight(1f), .97f, onTap = if (open && !prep) ({ onPick(k) }) else null) {
                    Row(Modifier.fillMaxWidth().alpha(if (open) 1f else .45f).border(1.4.dp, ink().copy(alpha = .25f), RoundedCornerShape(20.dp)).padding(vertical = 14.dp), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Rounded.CameraAlt, null, Modifier.size(20.dp), tint = ink()); Spacer(Modifier.width(8.dp)); HText(s.t(label), 14f, FontWeight.ExtraBold)
                    }
                }
            }
        }
        if (slot != null) {
            val msg = if (open) s.t("media_slot_open") else {
                val d = java.text.SimpleDateFormat("d MMM yyyy", java.util.Locale(if (s.lang == "id") "id" else "en")).format(java.util.Date(slot.optLong("reset_at")))
                s.t("media_slot_taken").replace("{u}", slot.optString("holder")).replace("{d}", d)
            }
            HText(msg + if (open) "\n" + s.t("media_note") else "", 12.5f, color = sub(), modifier = Modifier.padding(start = 6.dp, top = 8.dp), lh = 17f)
        }
    }
}

/** Gambar/video sebuah post (kind image|video): gambar rounded selebar kolom, video dengan pemutar sendiri (ketuk putar, ulang tanpa suara). */
@Composable fun PostMediaFile(a: A) {
    val url = a.files.firstOrNull()?.optString("url") ?: return
    var bmp by remember(a.id) { mutableStateOf<android.graphics.Bitmap?>(null) }
    var vfile by remember(a.id) { mutableStateOf<String?>(null) }
    var failed by remember(a.id) { mutableStateOf(false) }
    LaunchedEffect(a.id) {
        try {
            val b = Api.bytes(url) ?: run { failed = true; return@LaunchedEffect }
            if (a.kind == "image") bmp = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.Default) { android.graphics.BitmapFactory.decodeByteArray(b, 0, b.size) }
            else vfile = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) { val f = java.io.File(Store.app.cacheDir, "pv${a.id}.mp4"); if (!f.exists() || f.length() != b.size.toLong()) f.writeBytes(b); "file://" + f.absolutePath }
        } catch (_: Exception) { failed = true }
    }
    val shape = RoundedCornerShape(20.dp)
    val bm = bmp; val vf = vfile
    Column { when {
        bm != null -> { var big by remember { mutableStateOf(false) }
            Image(bm.asImageBitmap(), null, Modifier.padding(top = 10.dp, end = 8.dp).fillMaxWidth().clip(shape).border(1.dp, ink().copy(alpha = .08f), shape).clickable { big = true }, contentScale = ContentScale.FillWidth)
            if (big) androidx.compose.ui.window.Dialog(onDismissRequest = { big = false }, properties = androidx.compose.ui.window.DialogProperties(usePlatformDefaultWidth = false)) {
                Box(Modifier.fillMaxSize().background(androidx.compose.ui.graphics.Color.Black), contentAlignment = Alignment.Center) {
                    Image(bm.asImageBitmap(), null, Modifier.fillMaxSize().zoomable(), contentScale = ContentScale.Fit)
                    Icon(Icons.Rounded.Close, null, Modifier.align(Alignment.TopEnd).statusBarsPadding().padding(16.dp).size(28.dp).clickable { big = false }, tint = androidx.compose.ui.graphics.Color.White)
                }
            } }
        vf != null -> PostVideo(vf)
        else -> Box(Modifier.padding(top = 10.dp, end = 8.dp).fillMaxWidth().aspectRatio(4f / 3f).clip(shape).background(soft()), contentAlignment = Alignment.Center) {
            if (failed) Icon(Icons.Rounded.BrokenImage, null, Modifier.size(30.dp), tint = sub()) else androidx.compose.material3.CircularProgressIndicator(Modifier.size(24.dp), color = ink(), strokeWidth = 2.dp)
        }
    }
    if (a.ai && (a.kind == "image" || a.kind == "video")) AiTag(Store.t(if (a.kind == "video") (if (a.aiKind == "edited") "ai_video_edit" else "ai_video") else if (a.aiKind == "edited") "ai_photo_edit" else "ai_photo")) }
}

/** Zoom cubit 2 jari + geser + ketuk 2x (ZoomMod) untuk penampil layar penuh. */
fun Modifier.zoomable(): Modifier = composed {
    var sc by remember { mutableStateOf(1f) }; var off by remember { mutableStateOf(androidx.compose.ui.geometry.Offset.Zero) }
    this.pointerInput(Unit) { detectTransformGestures { _, pan, z, _ ->
        sc = (sc * z).coerceIn(1f, 6f); off = if (sc <= 1f) androidx.compose.ui.geometry.Offset.Zero else off + pan * sc } }
        .pointerInput(Unit) { detectTapGestures(onDoubleTap = { if (sc > 1f) { sc = 1f; off = androidx.compose.ui.geometry.Offset.Zero } else sc = 2.5f }) }
        .graphicsLayer { scaleX = sc; scaleY = sc; translationX = off.x; translationY = off.y }
}
