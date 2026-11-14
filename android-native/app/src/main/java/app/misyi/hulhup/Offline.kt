package app.misyi.hulhup

import android.content.Context
import java.io.File

/** Berkas audio offline di penyimpanan aplikasi (padanan files_io.dart). */
object Offline {
    private lateinit var dir: File
    fun init(c: Context) { dir = File(c.filesDir, "offline").apply { mkdirs() } }
    fun save(name: String, b: ByteArray): Boolean = try { File(dir, name).writeBytes(b); true } catch (_: Exception) { false }
    fun read(name: String): ByteArray? = try { File(dir, name).takeIf { it.exists() }?.readBytes() } catch (_: Exception) { null }
    fun delete(name: String) { try { File(dir, name).delete() } catch (_: Exception) {} }
}
