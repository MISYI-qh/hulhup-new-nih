package app.misyi.hulhup

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.time.LocalDate
import java.util.concurrent.TimeUnit

class ApiErr(val code: String) : Exception(code)

/** Lapisan data (padanan Api/Remote di core.dart): satu-satunya pintu ke server. */
object Api {
    val base: String = BuildConfig.API_URL
    var token: String? = null
    private lateinit var sp: SharedPreferences
    private val client = OkHttpClient.Builder().connectTimeout(25, TimeUnit.SECONDS).readTimeout(90, TimeUnit.SECONDS).writeTimeout(60, TimeUnit.SECONDS).build()
    private val media = LinkedHashMap<String, ByteArray>()

    fun init(c: Context) { sp = c.getSharedPreferences("hulhup", Context.MODE_PRIVATE); token = sp.getString("token", null) }
    val hasSession get() = token != null
    fun setSession(v: String?) { token = v; sp.edit().apply { if (v == null) remove("token") else putString("token", v) }.apply() }

    /** Kata sandi: spasi di ujung diabaikan, spasi di tengah tidak boleh. */
    private fun pw(p: String, b: JSONObject?): JSONObject? {
        if (b == null || !(p == "/register" || p == "/login" || p == "/me/password")) return b
        val o = JSONObject(b.toString())
        for (k in listOf("password", "old", "new")) if (o.opt(k) is String) o.put(k, o.getString(k).trim())
        val fresh = when (p) { "/register" -> o.optString("password", ""); "/me/password" -> o.optString("new", ""); else -> "" }
        if (Regex("\\s").containsMatchIn(fresh)) throw ApiErr("bad_password")
        return o
    }

    private fun headers(rb: Request.Builder, type: Boolean): Request.Builder {
        val d = LocalDate.now()
        token?.let { rb.header("Authorization", "Bearer $it") }
        rb.header("X-Today", "%04d-%02d-%02d".format(d.year, d.monthValue, d.dayOfMonth))
        rb.header("X-Device", "Hulhup app - Android")
        return rb
    }

    private fun out(code: Int, body: ByteArray): Any {
        var j: Any? = null
        try { val s = String(body, Charsets.UTF_8); j = if (s.isEmpty()) JSONObject() else JSONObject(s) } catch (_: Exception) { j = null }
        if (code in 200..299) return j ?: JSONObject()
        val e = (j as? JSONObject)?.optString("error", "")?.takeIf { it.isNotEmpty() } ?: if (code == 401) "unauthorized" else "server"
        throw ApiErr(e)
    }

    private fun exec(rq: Request): Pair<Int, ByteArray> {
        try { client.newCall(rq).execute().use { return it.code to (it.body?.bytes() ?: ByteArray(0)) } }
        catch (e: ApiErr) { throw e } catch (e: Exception) { throw ApiErr("network") }
    }

    private fun d2(v: Int) = v.toString().padStart(2, '0')

    suspend fun req(m: String, p: String, body: JSONObject? = null): JSONObject = withContext(Dispatchers.IO) {
        var b = pw(p, body)
        if (p == "/me/reminders" && b?.optBoolean("test", false) != true) {
            val n = java.util.Calendar.getInstance()
            val slot = java.util.Calendar.getInstance().apply { set(n.get(1), n.get(2), n.get(5), 19, 0, 0); set(java.util.Calendar.MILLISECOND, 0) }
            if (n.before(slot)) slot.add(java.util.Calendar.DAY_OF_MONTH, -1)
            b = JSONObject(b?.toString() ?: "{}").put("slot", "%04d-%s-%s".format(slot.get(1), d2(slot.get(2) + 1), d2(slot.get(5)))).put("slot_ms", slot.timeInMillis)
        }
        if (p == "/register") b = JSONObject(b?.toString() ?: "{}").put("slot", "")
        val rb = headers(Request.Builder().url(base + p), b != null)
        val rq = when (m) {
            "GET" -> rb.get()
            "POST" -> rb.post((b?.toString() ?: "").toRequestBody("application/json".toMediaType()))
            "PUT" -> rb.put((b?.toString() ?: "").toRequestBody("application/json".toMediaType()))
            "PATCH" -> rb.patch((b?.toString() ?: "").toRequestBody("application/json".toMediaType()))
            "DELETE" -> rb.delete()
            else -> throw ApiErr("not_found")
        }.build()
        val (code, bytes) = exec(rq)
        val j = out(code, bytes) as JSONObject
        if ((p == "/login" || p == "/register") && j.optString("token", "").isNotEmpty()) setSession(j.getString("token"))
        if ((p == "/logout" && m == "POST") || (p == "/me" && m == "DELETE")) setSession(null)
        j
    }

    suspend fun raw(p: String, b: ByteArray, type: String): JSONObject = withContext(Dispatchers.IO) {
        val rq = headers(Request.Builder().url(base + p), true).post(b.toRequestBody(type.toMediaType())).build()
        val (c, r) = exec(rq); out(c, r) as JSONObject
    }

    suspend fun multi(p: String, b: ByteArray, f: Map<String, String>): JSONObject = withContext(Dispatchers.IO) {
        val q = f.entries.joinToString("&") { URLEncoder.encode(it.key, "UTF-8") + "=" + URLEncoder.encode(it.value, "UTF-8") }
        raw("$p?$q", b, "application/octet-stream")
    }

    /** Ambil berkas audio/gambar dari server (perlu login untuk audio); disimpan sebentar di memori. */
    suspend fun bytes(url: String): ByteArray? {
        if (url.startsWith("file:")) return Offline.read(url.substring(5))
        if (!url.startsWith("/")) return null
        media[url]?.let { return it }
        val r = withContext(Dispatchers.IO) {
            val (c, bt) = exec(headers(Request.Builder().url(base + url), false).get().build())
            if (c != 200) throw ApiErr("network"); bt
        }
        if (media.size >= 6) media.remove(media.keys.first())
        media[url] = r
        return r
    }

    /** Unduh berkas dengan header kunci unduhan (pembaruan aplikasi). */
    suspend fun download(url: String, to: java.io.File, onProgress: (Float) -> Unit) = withContext(Dispatchers.IO) {
        val rq = Request.Builder().url(url).header("x-hulhup-key", BuildConfig.DL_KEY).build()
        try {
            client.newCall(rq).execute().use { r ->
                if (r.code != 200) throw ApiErr("http ${r.code}")
                val total = r.body!!.contentLength(); var got = 0L
                to.outputStream().use { o -> r.body!!.byteStream().use { i ->
                    val buf = ByteArray(65536)
                    while (true) { val n = i.read(buf); if (n < 0) break; o.write(buf, 0, n); got += n; if (total > 0) onProgress(got.toFloat() / total) }
                } }
            }
        } catch (e: ApiErr) { throw e } catch (e: Exception) { throw ApiErr("network") }
        onProgress(1f)
    }

    suspend fun getText(url: String, key: Boolean = false): Pair<Int, String> = withContext(Dispatchers.IO) {
        val rb = Request.Builder().url(url); if (key) rb.header("x-hulhup-key", BuildConfig.DL_KEY)
        val (c, b) = exec(rb.build()); c to String(b)
    }
}

/** Padanan mimeOf di core.dart. */
fun mimeOf(b: ByteArray): String? {
    if (b.size < 12) return null
    fun s(a: Int, n: Int) = String(b, a, n, Charsets.ISO_8859_1)
    if (s(0, 4) == "RIFF") return "audio/wav"
    if (s(4, 4) == "ftyp") return "audio/mp4"
    if (s(0, 4) == "OggS") return "audio/ogg"
    if (s(0, 4) == "fLaC") return "audio/flac"
    if (s(0, 3) == "ID3" || ((b[0].toInt() and 0xFF) == 0xFF && (b[1].toInt() and 0xE0) == 0xE0)) return "audio/mpeg"
    if (b[0].toInt() == 0x1A && b[1].toInt() == 0x45) return "audio/webm"
    return null
}

fun JSONArray.objects(): List<JSONObject> = (0 until length()).mapNotNull { optJSONObject(it) }
fun JSONObject.str(k: String, d: String = ""): String = if (isNull(k)) d else optString(k, d)
fun JSONObject.strN(k: String): String? = if (isNull(k)) null else optString(k)
fun JSONObject.int(k: String, d: Int = 0): Int = if (isNull(k)) d else optInt(k, d)
fun JSONObject.bool(k: String): Boolean = optBoolean(k, false)
