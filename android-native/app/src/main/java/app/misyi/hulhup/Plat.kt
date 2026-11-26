package app.misyi.hulhup

import android.Manifest
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import kotlinx.coroutines.CompletableDeferred
import java.io.File

/** Jembatan ke sistem Android: izin mikrofon, pemilih berkas, bagikan, salin, buka tautan, pasang APK (padanan plugin Flutter). */
object Plat {
    private var act: ComponentActivity? = null
    private var perm: CompletableDeferred<Boolean>? = null
    private var pick: CompletableDeferred<Uri?>? = null
    private var permL: androidx.activity.result.ActivityResultLauncher<String>? = null
    private var notifL: androidx.activity.result.ActivityResultLauncher<String>? = null
    private var cap: CompletableDeferred<Uri?>? = null
    private var capUri: Uri? = null
    private var capL: androidx.activity.result.ActivityResultLauncher<Pair<Uri, Boolean>>? = null
    private var pickL: androidx.activity.result.ActivityResultLauncher<Array<String>>? = null
    private var galL: androidx.activity.result.ActivityResultLauncher<androidx.activity.result.PickVisualMediaRequest>? = null

    /** Dipanggil di onCreate MainActivity (sebelum STARTED). */
    fun attach(a: ComponentActivity) {
        act = a
        capL = a.registerForActivityResult(object : androidx.activity.result.contract.ActivityResultContract<Pair<Uri, Boolean>, Boolean>() {
            override fun createIntent(context: Context, input: Pair<Uri, Boolean>) =
                Intent(if (input.second) android.provider.MediaStore.ACTION_VIDEO_CAPTURE else android.provider.MediaStore.ACTION_IMAGE_CAPTURE)
                    .putExtra(android.provider.MediaStore.EXTRA_OUTPUT, input.first).apply { if (input.second) putExtra(android.provider.MediaStore.EXTRA_DURATION_LIMIT, 10) }
                    .addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
            override fun parseResult(resultCode: Int, intent: Intent?) = resultCode == android.app.Activity.RESULT_OK
        }) { ok -> cap?.complete(if (ok) capUri else null) }
        permL = a.registerForActivityResult(ActivityResultContracts.RequestPermission()) { perm?.complete(it) }
        notifL = a.registerForActivityResult(ActivityResultContracts.RequestPermission()) { }
        pickL = a.registerForActivityResult(ActivityResultContracts.OpenDocument()) { pick?.complete(it) }
        galL = a.registerForActivityResult(ActivityResultContracts.PickVisualMedia()) { pick?.complete(it) }
    }

    fun askNotif() { if (android.os.Build.VERSION.SDK_INT >= 33) notifL?.launch(Manifest.permission.POST_NOTIFICATIONS) }

    suspend fun micPermission(): Boolean {
        val a = act ?: return false
        if (ContextCompat.checkSelfPermission(a, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) return true
        val d = CompletableDeferred<Boolean>(); perm = d; permL?.launch(Manifest.permission.RECORD_AUDIO)
        return d.await()
    }

    /** Pilih satu berkas; hasil: (isi, ekstensi). */
    suspend fun pickFile(types: Array<String>): Pair<ByteArray, String>? {
        val a = act ?: return null
        val d = CompletableDeferred<Uri?>(); pick = d; pickL?.launch(types)
        val u = d.await() ?: return null
        return try {
            val b = a.contentResolver.openInputStream(u)?.use { it.readBytes() } ?: return null
            var name = ""
            a.contentResolver.query(u, null, null, null, null)?.use { c -> if (c.moveToFirst()) { val i = c.getColumnIndex(OpenableColumns.DISPLAY_NAME); if (i >= 0) name = c.getString(i) ?: "" } }
            val ext = name.substringAfterLast('.', "").ifEmpty { (a.contentResolver.getType(u) ?: "").substringAfter('/').ifEmpty { "m4a" } }
            b to ext
        } catch (_: Exception) { null }
    }

    /** Pilih satu berkas dan kembalikan Uri-nya (untuk foto/video yang dikompres sebelum diunggah). */
    suspend fun pickUri(types: Array<String>): Uri? {
        val d = CompletableDeferred<Uri?>(); pick = d; pickL?.launch(types)
        return d.await()
    }

    /** Pilih foto/video dari galeri (pemilih foto sistem), bukan pemilih berkas. */
    suspend fun pickGallery(video: Boolean): Uri? {
        val d = CompletableDeferred<Uri?>(); pick = d
        galL?.launch(androidx.activity.result.PickVisualMediaRequest(if (video) ActivityResultContracts.PickVisualMedia.VideoOnly else ActivityResultContracts.PickVisualMedia.ImageOnly))
        return d.await()
    }

    /** Buka kamera sistem (foto atau rekam video maks 10 dtk); hasil Uri berkas sementara, null bila dibatalkan. */
    suspend fun capture(video: Boolean): Uri? {
        val a = act ?: return null
        return try {
            val f = File(Store.app.cacheDir, "cap_${System.currentTimeMillis()}.${if (video) "mp4" else "jpg"}")
            val u = FileProvider.getUriForFile(a, a.packageName + ".files", f)
            capUri = u; val d = CompletableDeferred<Uri?>(); cap = d; capL?.launch(u to video)
            d.await()
        } catch (_: Exception) { null }
    }

    /** Durasi audio dalam detik (dibulatkan ke atas), atau null bila bukan audio yang bisa dibaca. */
    fun audioSecs(b: ByteArray, ext: String): Int? {
        val f = File(Store.app.cacheDir, "probe.${ext.ifEmpty { "bin" }}")
        return try {
            f.writeBytes(b)
            val r = MediaMetadataRetriever(); r.setDataSource(f.absolutePath)
            val ms = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull(); r.release()
            if (ms == null || ms <= 0) null else Math.ceil(ms / 1000.0).toInt()
        } catch (_: Exception) { null } finally { f.delete() }
    }

    fun share(text: String) {
        val a = act ?: return
        val i = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text)
        a.startActivity(Intent.createChooser(i, null))
    }

    fun copy(text: String) {
        val cm = Store.app.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        cm.setPrimaryClip(ClipData.newPlainText("hulhup", text))
    }

    fun openExternal(url: String) {
        val a = act ?: return
        try { a.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (_: Exception) {}
    }

    /** Buka pemasang sistem untuk APK yang sudah diunduh. */
    fun installApk(f: File) {
        val a = act ?: return
        // Android 8+: izin "pasang aplikasi tidak dikenal" per aplikasi; arahkan ke pengaturannya dulu bila belum aktif.
        if (!a.packageManager.canRequestPackageInstalls()) {
            a.startActivity(Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${a.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            return
        }
        val u = FileProvider.getUriForFile(a, "${a.packageName}.files", f)
        a.startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(u, "application/vnd.android.package-archive").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}
