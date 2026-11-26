package app.misyi.hulhup

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaMetadataRetriever
import android.net.Uri
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.effect.Presentation
import androidx.media3.transformer.*
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.io.File

/** Hasil kompres foto/video: isi berkas, jenis (image|video), ekstensi, dan lama (detik, 1 untuk foto). */
/** Kotak MP4/MOV tingkat atas selain mdat (metadata asli) untuk detektor Deks di server; video dikompres ulang sehingga metadatanya hilang. */
fun mp4Meta(ctx: Context, uri: Uri): ByteArray {
    val out = java.io.ByteArrayOutputStream()
    try {
        ctx.contentResolver.openInputStream(uri)?.use { ins ->
            val inp = java.io.DataInputStream(java.io.BufferedInputStream(ins)); var total = 0L
            while (out.size() < 900_000) {
                val hd = ByteArray(8); try { inp.readFully(hd) } catch (_: Exception) { break }
                var size = java.nio.ByteBuffer.wrap(hd, 0, 4).int.toLong() and 0xffffffffL
                val type = String(hd, 4, 4, Charsets.ISO_8859_1); var hdr = 8
                if (size == 1L) { val e = ByteArray(8); inp.readFully(e); size = java.nio.ByteBuffer.wrap(e).long; hdr = 16 }
                if (size < hdr) break
                val body = size - hdr
                if (type != "mdat" && size <= 600_000 && hdr == 8) { val b = ByteArray(body.toInt()); inp.readFully(b); out.write(hd); out.write(b) }
                else { var left = body; while (left > 0) { val n = inp.skip(left); if (n <= 0) { if (inp.read() < 0) return@use else left-- } else left -= n } }
                total += size
            }
        }
    } catch (_: Throwable) { }
    return out.toByteArray()
}
fun packMeta(meta: ByteArray, stored: ByteArray): ByteArray {
    val h = java.nio.ByteBuffer.allocate(9).order(java.nio.ByteOrder.BIG_ENDIAN)
    h.put(0x44).put(0x4b).put(0x53).put(0x31).put(1).putInt(meta.size)
    return h.array() + meta + stored
}
class MediaClip(val kind: String, val bytes: ByteArray, val ext: String, val secs: Int, val bmp: Bitmap? = null, val orig: ByteArray? = null)

/** Kompres foto (maks sisi 1280px, JPEG ~q72, target <500KB) dan video (maks 10 dtk, ~640p H.264 700kbps + AAC 64kbps, target <3MB). */
object MediaPrep {
    suspend fun image(ctx: Context, uri: Uri): MediaClip? = withContext(Dispatchers.IO) {
        try {
            val o = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            ctx.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, o) }
            if (o.outWidth <= 0 || o.outHeight <= 0) return@withContext null
            var sample = 1; while (maxOf(o.outWidth, o.outHeight) / sample > 2560) sample *= 2
            val raw = ctx.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample }) } ?: return@withContext null
            // putar sesuai EXIF
            val rot = try { ctx.contentResolver.openInputStream(uri)?.use { androidx.exifinterface.media.ExifInterface(it).getAttributeInt(androidx.exifinterface.media.ExifInterface.TAG_ORIENTATION, 1) } ?: 1 } catch (_: Throwable) { 1 }
            val deg = when (rot) { 6 -> 90f; 3 -> 180f; 8 -> 270f; else -> 0f }
            val k = 1280f / maxOf(raw.width, raw.height)
            val m = android.graphics.Matrix().apply { if (k < 1f) postScale(k, k); if (deg != 0f) postRotate(deg) }
            val bmp = Bitmap.createBitmap(raw, 0, 0, raw.width, raw.height, m, true)
            var q = 72; var out: ByteArray
            do { val bo = ByteArrayOutputStream(); bmp.compress(Bitmap.CompressFormat.JPEG, q, bo); out = bo.toByteArray(); q -= 8 } while (out.size > 500_000 && q >= 40)
            val orig = try { ctx.contentResolver.openInputStream(uri)?.use { it.readBytes() }?.takeIf { it.size <= 25_000_000 } } catch (_: Throwable) { null }
            MediaClip("image", out, "jpg", 1, bmp, orig)
        } catch (_: Throwable) { null }
    }

    /** Null bila gagal; error "too_big" dilempar lewat ApiErr bila hasil tetap terlalu besar. */
    suspend fun video(ctx: Context, uri: Uri): MediaClip? {
        var durMs = 0L; var w = 0; var h = 0
        try {
            val r = MediaMetadataRetriever(); r.setDataSource(ctx, uri)
            durMs = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L
            w = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull() ?: 0
            h = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull() ?: 0
            val rot = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toIntOrNull() ?: 0
            if (rot == 90 || rot == 270) { val t = w; w = h; h = t }
            r.release()
        } catch (_: Throwable) { return null }
        if (durMs <= 0) return null
        val out = File(ctx.cacheDir, "up_${System.nanoTime()}.mp4")
        val done = CompletableDeferred<Boolean>()
        withContext(Dispatchers.Main) {
            try {
                val mi = MediaItem.Builder().setUri(uri).setClippingConfiguration(MediaItem.ClippingConfiguration.Builder().setEndPositionMs(10_000).build()).build()
                val tall = h >= w
                val edited = EditedMediaItem.Builder(mi).setEffects(Effects(emptyList(), listOf(Presentation.createForHeight(if (tall) 640 else 360)))).build()
                val enc = DefaultEncoderFactory.Builder(ctx)
                    .setRequestedVideoEncoderSettings(VideoEncoderSettings.Builder().setBitrate(700_000).build())
                    .setRequestedAudioEncoderSettings(AudioEncoderSettings.Builder().setBitrate(64_000).build()).build()
                val t = Transformer.Builder(ctx).setVideoMimeType(MimeTypes.VIDEO_H264).setAudioMimeType(MimeTypes.AUDIO_AAC).setEncoderFactory(enc)
                    .addListener(object : Transformer.Listener {
                        override fun onCompleted(composition: Composition, exportResult: ExportResult) { done.complete(true) }
                        override fun onError(composition: Composition, exportResult: ExportResult, exportException: ExportException) { done.complete(false) }
                    }).build()
                t.start(edited, out.absolutePath)
            } catch (_: Throwable) { done.complete(false) }
        }
        val ok = done.await()
        return withContext(Dispatchers.IO) {
            try {
                if (!ok || !out.exists()) null else {
                    val b = out.readBytes()
                    if (b.size > 4_000_000) throw ApiErr("media_big")
                    MediaClip("video", b, "mp4", Math.min(10, Math.ceil(durMs / 1000.0).toInt()).coerceAtLeast(1))
                }
            } finally { out.delete() }
        }
    }
}
