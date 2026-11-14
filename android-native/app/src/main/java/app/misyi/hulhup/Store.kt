package app.misyi.hulhup

import android.content.Context
import android.content.SharedPreferences
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.datasource.ByteArrayDataSource
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DataSpec
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import kotlinx.coroutines.*
import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar

/** Pusat data & status aplikasi (padanan class Store di core.dart). Setiap perubahan menaikkan [rev] supaya tampilan dirender ulang. */
object Store {
    lateinit var app: Context
    private lateinit var sp: SharedPreferences
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    var rev by mutableIntStateOf(0); private set
    fun poke() { rev++ }

    var me: U? by mutableStateOf(null)
    var unread = 0; var unreadSocial = 0
    var tapf: Map<String, Int> = emptyMap()
    val taps get() = tapf[filter] ?: 0
    var lang by mutableStateOf("id")
    /** 0 = ikuti sistem, 1 = terang, 2 = gelap (urutan ThemeMode Flutter). */
    var mode by mutableIntStateOf(0)
    var remind = true; var fromOffline = false
    var filter by mutableStateOf("public")
    var banner: ((String) -> Unit)? = null
    val offline = mutableListOf<A>()
    var online by mutableStateOf(true)
    private var lastOff: Int? = null
    var playing: Int? = null; var dur = 0
    private var pushed = 0
    private var playScope: Any? = null
    private var starting = false
    var posMs by mutableIntStateOf(0)
    var rate = 1.0f
    var bgmMuted = false; var bgmKey: Int? = null
    var homeMode = 0
    var updateReady by mutableStateOf(false)
    private var updChecked = 0L
    var searches: MutableList<String> = mutableListOf()

    private lateinit var p: ExoPlayer
    private lateinit var bg: ExoPlayer
    private var bgTok = 0
    private var bgScope: Any? = null
    private val bgCache = LinkedHashMap<String, ByteArray>()

    fun t(k: String): String { val v = Strings.S[k] ?: return k; return v[if (lang == "id") 0 else 1] }
    fun err(e: Throwable): String = if (e is ApiErr) (if (Strings.S.containsKey("e_${e.code}")) t("e_${e.code}") else t("e_server")) else t("e_network")

    fun init(c: Context) {
        app = c.applicationContext
        sp = app.getSharedPreferences("hulhup", Context.MODE_PRIVATE)
        Api.init(app); Offline.init(app)
        scope.launch(Dispatchers.IO) { try { Api.getText(Api.base + "/health?warm=1") } catch (_: Throwable) {} }
        lang = sp.getString("lang", "id") ?: "id"
        mode = sp.getInt("mode", 0).coerceIn(0, 2)
        remind = sp.getBoolean("remind", true)
        filter = sp.getString("filter", "public") ?: "public"
        rate = sp.getFloat("rate", 1f).coerceIn(0.5f, 2f)
        bgmMuted = sp.getBoolean("bgm_muted", false)
        val known = listOf("public", "followers", "following", "both", "friend", "best", "partner", "family", "relations", "me")
        if (filter.split(",").any { it !in known && !Regex("^L\\d+$").matches(it) }) filter = "public"
        pushed = sp.getInt("pushed", 0)
        searches = (sp.getString("search_hist", null)?.let { s -> try { JSONArray(s).let { a -> (0 until a.length()).map { a.getString(it) } } } catch (_: Exception) { null } } ?: emptyList()).toMutableList()
        try { JSONArray(sp.getString("offline", "[]")).objects().forEach { offline.add(A(it)) } } catch (_: Exception) {}
        // Cadangan Acak otomatis (versi lama) dihapus: offline hanya berisi yang kamu simpan sendiri.
        try { sp.getString("acak_cache", null)?.let { old -> JSONArray(old).objects().forEach { Offline.delete("rc${it.optInt("id")}.audio") }; sp.edit().remove("acak_cache").apply() } } catch (_: Exception) {}
        p = ExoPlayer.Builder(app).build(); bg = ExoPlayer.Builder(app).build()
        p.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(state: Int) { if (state == Player.STATE_READY) dur = p.duration.toInt().coerceAtLeast(0) }
        })
        scope.launch { while (true) { delay(120); if (playing != null) { val v = p.currentPosition.toInt(); if (v != posMs) posMs = v } } }
        val cm = app.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        online = isOnline(cm)
        try {
            cm.registerDefaultNetworkCallback(object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(n: Network) = connChanged(true)
                override fun onLost(n: Network) = connChanged(isOnline(cm))
            })
        } catch (_: Exception) {}
        scope.launch { while (true) { delay(30_000); poll() } }
    }

    private fun isOnline(cm: ConnectivityManager): Boolean = try {
        val c = cm.getNetworkCapabilities(cm.activeNetwork); c?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
    } catch (_: Exception) { true }

    private fun connChanged(on: Boolean) = scope.launch { if (on != online) { online = on; poke(); if (on) { refresh(); flushCounts() } } }

    // ── Waktu ──
    fun ago(ms: Long): String {
        val m = (System.currentTimeMillis() - ms) / 60000
        if (m < 1) return t("ago_now")
        if (m < 60) return "$m ${t("ago_m")}"
        val h = m / 60
        return if (h < 24) "$h ${t("ago_h")}" else "${h / 24} ${t("ago_d")}"
    }
    fun `when`(ms: Long): String {
        if (ms <= 0) return ""
        val d = Calendar.getInstance().apply { timeInMillis = ms }
        if ((System.currentTimeMillis() - ms) / 86400000 < 7) return ago(ms)
        val m = mapOf("id" to listOf("Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"), "en" to listOf("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"))
        return "${d.get(Calendar.DAY_OF_MONTH)} ${m[lang]!![d.get(Calendar.MONTH)]} ${d.get(Calendar.YEAR)}"
    }
    fun fmt(n: Int): String {
        val s = "$n"; val b = StringBuilder(); val sep = if (lang == "id") "." else ","
        for (i in s.indices) { if (i > 0 && (s.length - i) % 3 == 0) b.append(sep); b.append(s[i]) }
        return b.toString()
    }

    // ── Sesi & status ──
    suspend fun refresh() {
        try {
            if (Api.hasSession) {
                val j = Api.req("GET", "/me")
                me = U(j.getJSONObject("user"))
                cleanFilter(); flushCounts()
                try { sp.edit().putString("me_cache", j.getJSONObject("user").toString()).apply() } catch (_: Exception) {}
                unread = j.int("unread"); unreadSocial = j.int("unread_social")
                if (unreadSocial < pushed) { pushed = unreadSocial; sp.edit().putInt("pushed", pushed).apply() }
            }
            val st = Api.req("GET", "/stats")
            st.optJSONObject("tapf")?.let { o ->
                tapf = o.keys().asSequence().associateWith { o.optInt(it) }
                try { sp.edit().putString("tapf_cache", o.toString()).apply() } catch (_: Exception) {}
            }
        } catch (e: ApiErr) {
            if (e.code == "unauthorized") clear()
            else fallbackCache()
        } catch (_: Exception) { fallbackCache() }
        poke()
    }

    private fun fallbackCache() {
        // Tanpa internet: pakai data terakhir yang tersimpan supaya aplikasi tetap bisa dibuka.
        try {
            if (me == null && Api.hasSession) sp.getString("me_cache", null)?.let { me = U(JSONObject(it)) }
            if (tapf.isEmpty()) sp.getString("tapf_cache", null)?.let { s -> val o = JSONObject(s); tapf = o.keys().asSequence().associateWith { o.optInt(it) } }
        } catch (_: Exception) {}
    }

    /** Dipanggil saat aplikasi dibuka/kembali ke depan. Mengembalikan jumlah hari berturut-turut bila ini masuk pertama hari ini. */
    suspend fun start(): Int? {
        if (starting) return null
        starting = true
        var fresh: Int? = null
        scope.launch { checkUpdate() }
        try {
            refresh()
            if (me != null) {
                val j = Api.req("POST", "/me/checkin")
                if (j.bool("new")) fresh = j.int("streak")
                Api.req("POST", "/me/reminders", JSONObject().put("on", remind))
                refresh()
                if (unreadSocial > pushed) {
                    val msg = t("push_unread").replace("{n}", "$unreadSocial")
                    banner?.invoke(msg); Notifier.show(1, "Hulhup", msg, t("notif"))
                }
                pushed = unreadSocial; sp.edit().putInt("pushed", pushed).apply()
                val viaFcm = Push.register(lang)
                Notifier.watch(!viaFcm)
            }
        } catch (_: Exception) {
        } finally { starting = false }
        try {
            if (remind) { if (!Notifier.enabled()) Notifier.allow(); syncReminders() } else Notifier.cancelReminders()
        } catch (_: Exception) {}
        return fresh
    }

    suspend fun checkUpdate(force: Boolean = false): Boolean {
        val n = System.currentTimeMillis()
        if (!force && (BuildConfig.BUILD == 0 || (updChecked != 0L && n - updChecked < 30 * 60000))) return updateReady
        updChecked = n
        try {
            val (c, body) = Api.getText("https://hulhup.my.id/version.json?t=$n", key = true)
            if (c != 200) return updateReady
            val b = JSONObject(body).optString("build", "0").toIntOrNull() ?: 0
            val up = b > BuildConfig.BUILD
            if (up != updateReady) { updateReady = up; poke() }
        } catch (_: Exception) {}
        return updateReady
    }

    private suspend fun poll() {
        if (me == null || starting) return
        try {
            refresh()
            if (unreadSocial > pushed) {
                val msg = t("push_unread").replace("{n}", "$unreadSocial")
                banner?.invoke(msg); Notifier.show(1, "Hulhup", msg, t("notif"))
            }
            pushed = unreadSocial; sp.edit().putInt("pushed", pushed).apply()
        } catch (_: Exception) {}
    }

    /** Pengingat "Kamu lelah?" jam 19.00 setiap hari (alarm lokal tepat waktu). */
    fun syncReminders() { Notifier.cancelReminders(); if (!remind) return; Notifier.daily(101, 19, 0, t("r_title"), t("r_body"), t("notif")) }

    fun setRemind(v: Boolean) {
        remind = v; sp.edit().putBoolean("remind", v).apply(); poke()
        scope.launch {
            if (v) { Notifier.allow(); sp.edit().putBoolean("asked", true).apply(); syncReminders() } else Notifier.cancelReminders()
            if (me != null) Push.register(lang)
        }
    }

    private fun clear() { Api.setSession(null); me = null; unread = 0; unreadSocial = 0; pushed = 0; sp.edit().putInt("pushed", 0).apply(); Notifier.watch(false) }

    suspend fun auth(path: String, body: JSONObject): JSONObject {
        val j = Api.req("POST", path, body)
        me = U(j.getJSONObject("user")); poke()
        scope.launch { start() }
        return j
    }
    suspend fun logout() { Push.unregister(); try { Api.req("POST", "/logout") } catch (_: Exception) {}; clear(); refresh() }
    suspend fun deleteAccount() { Api.req("DELETE", "/me"); clear(); refresh() }
    fun setLang(l: String) { lang = l; sp.edit().putString("lang", l).apply(); syncReminders(); if (me != null) scope.launch { Push.register(l) } }
    fun setMode(m: Int) { mode = m; sp.edit().putInt("mode", m).apply() }

    fun relName(x: String) = if (x in listOf("friend", "best", "partner", "family", "custom")) t("a_$x").lowercase() else x
    fun labelName(id: Int) = me?.labels?.get(id) ?: t("a_custom")
    fun notifText(type: String, extra: String): String = when (type) {
        "like" -> t("n_like"); "comment" -> t("n_comment"); "reply" -> t("n_reply"); "mention" -> t("n_mention")
        "rel_req" -> t("n_rel_req").replace("{r}", relName(extra)); "rel_ok" -> t("n_rel_ok").replace("{r}", relName(extra))
        else -> t("n_follow")
    }

    private fun cleanFilter() {
        val ok = filter.split(",").filter { it.isNotEmpty() && (!Regex("^L\\d+$").matches(it) || (me?.labels?.containsKey(it.substring(1).toIntOrNull()) ?: false)) }
        val v = if (ok.isEmpty()) "public" else ok.joinToString(",")
        if (v != filter) { filter = v; sp.edit().putString("filter", v).apply() }
    }
    fun setFilter(v: String) { filter = v; sp.edit().putString("filter", v).apply(); poke() }

    suspend fun setRvis(v: String) { val j = Api.req("PATCH", "/me/settings", JSONObject().put("rvis", v)); me = U(j.getJSONObject("user")); poke() }
    suspend fun setPvis(v: String) { val j = Api.req("PATCH", "/me/settings", JSONObject().put("pvis", v)); me = U(j.getJSONObject("user")); poke() }

    // ── Acak ──
    private fun pickOffline(): A? {
        var c = offline.toList(); if (c.isEmpty()) return null
        if (c.size > 1 && lastOff != null) c = c.filter { it.id != lastOff }
        val a = c.random(); lastOff = a.id; return a
    }

    /** Tanpa internet, acak diambil dari audio yang sudah dijadikan offline. */
    suspend fun random(): A? {
        fromOffline = false
        if (!online) { fromOffline = true; return pickOffline() }
        return try {
            val f = if (me == null) "public" else filter
            val j = Api.req("GET", "/random?f=$f")
            if (me != null && !j.isNull("taps")) tapf = tapf + (f to j.optInt("taps"))
            poke()
            if (j.isNull("audio")) null else A(j.getJSONObject("audio"))
        } catch (e: ApiErr) { throw e } catch (_: Exception) { fromOffline = true; pickOffline() }
    }

    // ── Hitung putar/lihat (antrean offline) ──
    private val counted = mutableSetOf<String>()
    private var pend = mutableSetOf<String>()
    private fun savePend() { try { sp.edit().putStringSet("pend_count", pend.toSet()).apply() } catch (_: Exception) {} }
    private fun count(a: A, kind: String) { if (me == null || a.id <= 0 || !counted.add("$kind${a.id}")) return; send(a, kind, a.id) }
    private fun send(a: A?, kind: String, id: Int) {
        val k = "$kind$id"
        scope.launch {
            try {
                val j = Api.req("POST", "/audios/$id/$kind")
                if (pend.remove(k)) savePend()
                if (a != null) { a.plays = if (j.has("plays")) j.optInt("plays") else a.plays; a.views = if (j.has("views")) j.optInt("views") else a.views }
                poke()
            } catch (e: Exception) {
                if (e is ApiErr && !e.code.contains("rate") && !e.code.contains("many")) { if (pend.remove(k)) savePend(); return@launch }
                if (pend.add(k)) savePend()
            }
        }
    }
    fun flushCounts() {
        if (me == null) return
        try { pend = (sp.getStringSet("pend_count", emptySet()) ?: emptySet()).toMutableSet().also { it.addAll(pend) } } catch (_: Exception) {}
        for (k in pend.toList()) {
            val m = Regex("^(play|view)(\\d+)$").find(k)
            if (m == null) { pend.remove(k); continue }
            send(null, m.groupValues[1], m.groupValues[2].toInt())
        }
    }
    fun countPlay(a: A) { if (!a.bgm && a.files.isNotEmpty()) count(a, "play") }
    fun countView(a: A) = count(a, "view")

    fun needNet(): Boolean { if (online) return true; banner?.invoke(t("need_net")); return false }

    // ── Offline ──
    fun isOffline(id: Int) = offline.any { it.id == id }
    suspend fun toggleOffline(a: A) {
        val i = offline.indexOfFirst { it.id == a.id }
        if (i >= 0) { Offline.delete("off${a.id}.audio"); offline.removeAt(i) }
        else {
            val j = a.toJson()
            // Post tanpa audio (teks saja) tidak ada berkas untuk diunduh: yang disimpan hanya isinya.
            if (a.url.isNotEmpty()) {
                val b = Api.bytes(a.url) ?: throw ApiErr("server")
                if (!Offline.save("off${a.id}.audio", b)) throw ApiErr("storage_full")
                j.put("url", "file:off${a.id}.audio")
            }
            offline.add(0, A(j))
        }
        sp.edit().putString("offline", JSONArray(offline.map { it.toJson() }).toString()).apply()
        poke()
    }

    // ── Pemutar ──
    fun setRate(r: Float) { rate = r; poke(); try { p.playbackParameters = PlaybackParameters(r) } catch (_: Exception) {}; sp.edit().putFloat("rate", r).apply() }
    fun cycleRate() { val r = listOf(0.5f, 0.75f, 1f, 1.25f, 1.5f, 2f); val i = r.indexOfFirst { it >= rate - .001f }; setRate(r[(i + 1) % r.size]) }

    private fun source(b: ByteArray): androidx.media3.exoplayer.source.MediaSource {
        val f = DataSource.Factory { ByteArrayDataSource(b) }
        return ProgressiveMediaSource.Factory(f).createMediaSource(MediaItem.fromUri("bytes://a"))
    }

    suspend fun playBgm(key: Int, url: String, scope: Any? = null) {
        if (bgmKey == key) { bg.volume = if (bgmMuted) 0f else 1f; return }
        val tok = ++bgTok
        bgmKey = key; bgScope = scope; poke()
        try {
            bg.stop()
            bg.repeatMode = Player.REPEAT_MODE_ONE
            var b = bgCache[url]
            if (b == null) { b = Api.bytes(url); if (b != null) { if (bgCache.size > 6) bgCache.remove(bgCache.keys.first()); bgCache[url] = b } }
            if (tok != bgTok) return
            bg.volume = if (bgmMuted) 0f else 1f
            b ?: throw ApiErr("network")
            bg.setMediaSource(source(b)); bg.prepare(); bg.play()
        } catch (_: Exception) { if (tok == bgTok) { bgmKey = null; bgScope = null; poke() } }
    }
    fun stopBgm() { bgTok++; bgmKey = null; bgScope = null; try { bg.stop() } catch (_: Exception) {}; poke() }
    fun leaveBgm(s: Any) { if (bgScope == s && bgmKey != null) scope.launch { stopBgm() } }
    fun setBgmMuted(v: Boolean) { bgmMuted = v; try { bg.volume = if (v) 0f else 1f } catch (_: Exception) {}; sp.edit().putBoolean("bgm_muted", v).apply(); poke() }

    suspend fun play(a: A, force: Boolean = false, loop: Boolean = true, scope: Any? = null) { countPlay(a); playUrl(a.id, a.url, force, loop, scope) }

    /** Putar satu berkas audio; [key] membedakan pemutar (audio post, audio ke-n, audio komentar). */
    suspend fun playUrl(key: Int, url: String, force: Boolean = false, loop: Boolean = true, scope: Any? = null) {
        if (url.isEmpty()) return
        if (!force && playing == key) { stop(); return }
        playing = key; playScope = scope; posMs = 0; dur = 0; poke()
        p.stop()
        p.repeatMode = if (loop) Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_OFF
        p.removeListener(endListener)
        val b = Api.bytes(url)
        if (playing != key) return
        b ?: throw ApiErr("network")
        p.setMediaSource(source(b)); p.prepare(); p.playbackParameters = PlaybackParameters(rate); p.play()
        p.addListener(endListener)
    }
    private val endListener = object : Player.Listener {
        override fun onPlaybackStateChanged(state: Int) { if (state == Player.STATE_ENDED) { playing = null; playScope = null; if (dur > 0) posMs = dur; poke() } }
    }

    fun stop() { p.stop(); playing = null; playScope = null; posMs = 0; poke() }
    /** Dipanggil saat halaman ditutup: hentikan suara bila diputar dari halaman itu. */
    fun leave(s: Any) { if (playScope == s && playing != null) scope.launch { stop() } }

    // ── Riwayat pencarian ──
    private fun saveSearches() { try { sp.edit().putString("search_hist", JSONArray(searches).toString()).apply() } catch (_: Exception) {} }
    fun addSearch(q0: String) {
        val q = q0.trim(); if (q.isEmpty()) return
        searches.removeAll { it.equals(q, ignoreCase = true) }; searches.add(0, q)
        while (searches.size > 20) searches.removeAt(searches.size - 1)
        saveSearches()
    }
    fun delSearch(q: String) { searches.remove(q); saveSearches(); poke() }
    fun clearSearches() { searches = mutableListOf(); try { sp.edit().remove("search_hist").apply() } catch (_: Exception) {}; poke() }

    suspend fun like(a: A) {
        val j = Api.req("POST", "/audios/${a.id}/like")
        a.liked = j.bool("liked"); a.likes = j.int("likes"); poke()
    }

    val kApkUrl: String get() {
        val abi = android.os.Build.SUPPORTED_ABIS.firstOrNull() ?: ""
        return if (abi.startsWith("armeabi") ) "https://hulhup.my.id/hulhup-32.apk" else "https://hulhup.my.id/hulhup.apk"
    }
}
