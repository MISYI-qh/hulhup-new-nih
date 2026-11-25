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
class MediaClip(val kind: String, val bytes: ByteArray, val ext: String, val secs: Int, val bmp: Bitmap? = null)

/** Kompres foto (maks sisi 1280px, JPEG ~q72, target <500KB) dan video (maks 15 dtk, ~640p H.264 700kbps + AAC 64kbps, target <3MB). */
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
            MediaClip("image", out, "jpg", 1, bmp)
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
                val mi = MediaItem.Builder().setUri(uri).setClippingConfiguration(MediaItem.ClippingConfiguration.Builder().setEndPositionMs(15_000).build()).build()
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
                    MediaClip("video", b, "mp4", Math.min(15, Math.ceil(durMs / 1000.0).toInt()).coerceAtLeast(1))
                }
            } finally { out.delete() }
        }
    }
}
