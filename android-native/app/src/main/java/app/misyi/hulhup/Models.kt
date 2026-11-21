package app.misyi.hulhup

import org.json.JSONArray
import org.json.JSONObject

/** Akun (padanan class U di core.dart). */
class U(j: JSONObject) {
    val username = j.str("username"); val name = j.str("name"); val bio = j.str("bio"); val birth = j.str("birth")
    val avatar = j.strN("avatar"); val cover = j.strN("cover")
    val pvis = j.str("pvis", "public"); val rvis = j.str("rvis", "public")
    val streak = j.int("streak"); val days = j.int("days"); val taps = j.int("taps"); val age = j.int("age")
    val rels = j.int("rels"); val audios = j.int("audios")
    var followers = j.int("followers"); var following = j.int("following")
    var isFollowing = j.bool("is_following")
    val isMe = j.bool("is_me"); val verified = j.bool("verified"); val avatarAi = j.bool("avatar_ai")
    val avatarAiKind = if (j.has("avatar_ai_kind") && !j.isNull("avatar_ai_kind")) j.optString("avatar_ai_kind") else if (j.bool("avatar_ai")) "made" else ""
    /** Nama hubungan custom milikku (id -> nama). */
    val labels: Map<Int, String> = (j.optJSONArray("labels") ?: JSONArray()).objects().associate { it.optInt("id") to it.optString("name") }
}

/** Post/audio (padanan class A di core.dart). Disimpan sebagai JSON supaya bisa disimpan offline apa adanya. */
class A(val j: JSONObject) {
    val id = j.int("id"); val secs = j.int("secs"); val created = (j.optLong("created", 0L)); val desc = j.str("desc"); val url = j.str("url")
    val vis = j.str("vis", "public"); val rand = j.str("rand", "public"); val owner = j.str("owner"); val ownerName = j.str("owner_name")
    val ownerAvatar = j.strN("owner_avatar"); val ownerVerified = j.bool("owner_verified")
    val popup = j.bool("popup"); val pprof = if (j.has("pprof")) j.optBoolean("pprof") != false else true
    var likes = j.int("likes"); var plays = j.int("plays"); var views = j.int("views"); var liked = j.bool("liked")
    val long = j.bool("long"); val inRand = if (j.has("in_rand")) j.optBoolean("in_rand") != false else true; val inHups = j.bool("in_hups")
    var comments = j.int("comments"); var saved = j.bool("saved"); val bgm = j.bool("bgm"); val ai = j.bool("ai")
    val ownerAvatarAi = j.bool("owner_avatar_ai")
    val aiKind = if (j.has("ai_kind") && !j.isNull("ai_kind")) j.optString("ai_kind") else if (j.bool("ai")) "made" else ""
    val ownerAvatarAiKind = if (j.has("owner_avatar_ai_kind") && !j.isNull("owner_avatar_ai_kind")) j.optString("owner_avatar_ai_kind") else if (j.bool("owner_avatar_ai")) "made" else ""
    val bgmIdx = j.int("bgm_idx")
    val text: String? = j.strN("text")
    val to: List<String> = (j.optJSONArray("to") ?: JSONArray()).objects().map { it.optString("username") }
    val media: List<String> = (j.optJSONArray("media") ?: JSONArray()).let { a -> (0 until a.length()).mapNotNull { a.optString(it).ifEmpty { null } } }
    val files: List<JSONObject> = j.optJSONArray("files")?.objects() ?: if (url.isEmpty()) emptyList() else listOf(JSONObject().put("url", url).put("secs", secs))

    fun toJson(): JSONObject = JSONObject().put("id", id).put("secs", secs).put("created", created).put("desc", desc).put("url", url).put("vis", vis)
        .put("rand", rand).put("owner", owner).put("owner_name", ownerName).put("owner_avatar", ownerAvatar).put("owner_verified", ownerVerified)
        .put("popup", popup).put("pprof", pprof).put("likes", likes).put("plays", plays).put("views", views).put("liked", liked).put("long", long)
        .put("in_rand", inRand).put("in_hups", inHups).put("comments", comments).put("saved", saved).put("files", JSONArray(files)).put("media", JSONArray(media)).put("bgm", bgm)
        .put("ai", ai).put("ai_kind", aiKind).put("owner_avatar_ai", ownerAvatarAi).put("owner_avatar_ai_kind", ownerAvatarAiKind).put("text", text)
        .put("to", JSONArray(to.map { JSONObject().put("username", it) }))
}

fun mmss(s: Int) = "${s / 60}:${(s % 60).toString().padStart(2, '0')}"

/** Padanan Code (kode pendek post) di web/lib/code.ts: id angka <-> 7 karakter base62. */
object PostCode {
    private const val A = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
    private val K = intArrayOf(0x2f4a7c, 0x91b3d5, 0x5e08a1, 0xc7392e)
    private const val M = 0x3ffff
    private fun f(x: Int, k: Int): Int { var h = (x xor k) * -0x61c8864f; h = h xor (h ushr 15); h *= -0x7a143595; h = h xor (h ushr 13); return h and M }
    fun enc(id: Long): String {
        var l = ((id / (M + 1)) and M.toLong()).toInt(); var r = (id and M.toLong()).toInt()
        for (k in K) { val t = l xor f(r, k); l = r; r = t }
        var n = l.toLong() * (M + 1) + r; val s = StringBuilder()
        repeat(7) { s.insert(0, A[(n % 62).toInt()]); n /= 62 }
        return s.toString()
    }
    fun dec(code: String): Long? {
        if (!Regex("^[0-9a-zA-Z]{7}$").matches(code)) return null
        var n = 0L; for (ch in code) n = n * 62 + A.indexOf(ch)
        if (n >= (M + 1).toLong() * (M + 1)) return null
        var l = (n / (M + 1)).toInt(); var r = (n % (M + 1)).toInt()
        for (k in K.reversed()) { val t = r xor f(l, k); r = l; l = t }
        return l.toLong() * (M + 1) + r
    }
}
