@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package app.misyi.hulhup

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.*
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.runtime.*
import androidx.compose.runtime.snapshots.SnapshotStateList
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

/** Penanda untuk memuat ulang profil setelah ada perubahan (edit profil, hubungan). */
object ProfileBus { var rev by mutableIntStateOf(0) }

private fun JSONObject.list(k: String) = optJSONArray(k)?.objects() ?: emptyList()

// ───────── profil ─────────
@Composable fun ProfilePage(uname: String?, tab0: Int = 0) {
    val s = Store; val sc = rememberCoroutineScope(); @Suppress("UNUSED_EXPRESSION") s.rev
    val owner = remember { Any() }; DisposableEffect(Unit) { onDispose { s.leave(owner) } }
    if (uname == null) {
        LaunchedEffect(s.me) { s.me?.let { Nav.replace(profileScreen(it.username, 0)) } }
        Column(Modifier.fillMaxSize()) {
            TopBar(back = true)
            Empty(Icons.Outlined.PersonOutline, "${s.t("guest")}\n${s.t("guest_note")}", action = { PBtn(s.t("login"), { go("/login") }, modifier = Modifier.width(200.dp)) })
        }
        return
    }
    val mine = uname == s.me?.username
    var user by remember { mutableStateOf<U?>(null) }
    var list by remember { mutableStateOf<List<A>>(emptyList()) }; var liked by remember { mutableStateOf<List<A>>(emptyList()) }; var saved by remember { mutableStateOf<List<A>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }; var busy by remember { mutableStateOf(false) }; var locked by remember { mutableStateOf(false) }; var error by remember { mutableStateOf<String?>(null) }
    var tab by remember { mutableIntStateOf(if (tab0 == 1) 0 else tab0) }
    var rel by remember { mutableStateOf(JSONObject().put("status", "none").put("type", "")) }
    var relCount by remember { mutableIntStateOf(0) }; var relIn by remember { mutableIntStateOf(0) }
    var tick by remember { mutableIntStateOf(0) }

    suspend fun load() {
        try {
            val j = Api.req("GET", "/users/$uname")
            user = U(j.getJSONObject("user")); list = j.list("audios").map { A(it) }; locked = j.optBoolean("locked")
            rel = j.optJSONObject("rel") ?: JSONObject().put("status", "none").put("type", "")
            if (mine) { val r = Api.req("GET", "/me/relations"); relCount = r.list("active").size; relIn = r.list("incoming").size }
            else { relCount = Api.req("GET", "/users/$uname/relations").list("items").size; relIn = 0 }
            if (mine) { liked = Api.req("GET", "/me/liked").list("audios").map { A(it) }; saved = Api.req("GET", "/me/saved").list("audios").map { A(it) } }
            error = null
        } catch (e: Exception) { error = s.err(e) }
        loading = false
    }
    LaunchedEffect(uname, ProfileBus.rev, tick) { load() }

    fun relReq(ok: String, f: suspend () -> Unit) = sc.launch { try { f(); toast(ok); load() } catch (e: Exception) { toast(s.err(e), true) } }
    fun relAdd() = sc.launch {
        val t = chooseSheet(s.t("rel_pick"), relKinds + (s.me?.labels?.keys ?: emptySet()).map { "L$it" } + "newlabel", null) ?: return@launch
        var type = t; var label: String? = null
        val m = Regex("^L(\\d+)$").find(t)
        if (t == "newlabel") { label = askLabel() ?: return@launch; type = "custom" }
        else if (m != null) { label = s.labelName(m.groupValues[1].toInt()); type = "custom" }
        relReq(s.t("rel_sent")) { Api.req("POST", "/relations", JSONObject().put("to", uname).put("type", type).apply { if (label != null) put("label", label) }); s.refresh() }
    }
    fun relEnd(name: String) = sc.launch {
        if (!confirm(s.t("rel_end"), s.t("rel_end_q").replace("{n}", name), s.t("rel_end"), danger = true)) return@launch
        relReq(s.t("rel_ended")) { Api.req("DELETE", "/relations/$uname") }
    }

    Column(Modifier.fillMaxSize()) {
        TopBar(back = true, nActions = 2, actions = {
            if (mine) {
                IconBtn(Icons.Outlined.NotificationsNone, dot = s.unread > 0) { go("/notifications") }
                IconBtn(Icons.Outlined.Edit) { if (s.needNet()) go("/settings/profile") }
            }
        })
        Box(Modifier.weight(1f)) {
            val u = user
            if (loading) Loader("profile")
            else if (error != null) Empty(Icons.Rounded.CloudOff, error!!, action = { PBtn(s.t("retry"), { loading = true; tick++ }, modifier = Modifier.width(160.dp)) })
            else if (u != null) {
                val shown = when (tab) { 2 -> liked; 3 -> saved; else -> list }
                LogoRefresh({ load() }) {
                    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 40.dp)) {
                        item {
                            Column {
                                Spacer(Modifier.height(10.dp))
                                In(0) {
                                    Box(Modifier.padding(horizontal = 24.dp)) {
                                        Tap(onTap = if (u.avatar == null) null else ({ Nav.go(Screen("image") { ImageViewer(u.avatar, u.name) }) }), scale = .96f) {
                                            Avatar(u.avatar, u.name, 96.dp)
                                        }
                                    }
                                }
                                Spacer(Modifier.height(16.dp))
                                Column(Modifier.padding(horizontal = 24.dp)) { In(1) { Column {
                                    Row(verticalAlignment = Alignment.CenterVertically) { HText(u.name, 24f, FontWeight.ExtraBold, ls = -.5f, modifier = Modifier.weight(1f, false)); if (u.verified) Icon(Icons.Rounded.Verified, null, Modifier.padding(start = 6.dp).size(22.dp), tint = Blue) }
                                    Spacer(Modifier.height(2.dp)); HText(u.username, 15f, color = sub())
                                    if (u.avatarAi) AiTag(s.t(if (u.avatarAiKind == "edited") "ai_photo_edit" else "ai_photo"))
                                    if (u.bio.isNotEmpty()) Box(Modifier.padding(top = 12.dp)) { MentionText(u.bio, androidx.compose.ui.text.TextStyle(fontSize = 15.sp, lineHeight = 21.75.sp, fontFamily = Outfit)) }
                                    Spacer(Modifier.height(16.dp))
                                    FlowRow(horizontalArrangement = Arrangement.spacedBy(22.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                        @Composable fun stat(n: Int, label: String, kind: String) = Tap(onTap = { go("/@$uname/$kind") }) { Row(Modifier.heightIn(min = 40.dp), verticalAlignment = Alignment.CenterVertically) { HText(s.fmt(n), 17f, FontWeight.ExtraBold); Spacer(Modifier.width(6.dp)); HText(label, 14f, color = sub()) } }
                                        stat(u.followers, s.t("followers"), "followers"); stat(u.following, s.t("following"), "following")
                                        if (mine || u.rels >= 0) Tap(onTap = { go("/@$uname/relations") }) {
                                            Row(Modifier.heightIn(min = 40.dp), verticalAlignment = Alignment.CenterVertically) { HText(s.fmt(relCount), 17f, FontWeight.ExtraBold); Spacer(Modifier.width(6.dp)); HText(s.t("rel_title"), 14f, color = sub()); if (mine && relIn > 0) Box(Modifier.padding(start = 6.dp).size(8.dp).background(Heart, CircleShape)) }
                                        }
                                    }
                                    if (mine && (u.streak > 0 || u.days > 0)) Box(Modifier.padding(top = 14.dp)) { StreakChip(u.streak, u.days, open = true) }
                                    else if (!mine && u.streak > 0) Box(Modifier.padding(top = 14.dp)) { StreakChip(u.streak, 0) }
                                    Spacer(Modifier.height(18.dp))
                                    if (!mine && s.me != null) {
                                        PBtn(if (u.isFollowing) s.t("unfollow") else s.t("follow"), {
                                            busy = true
                                            sc.launch { try { val j = Api.req("POST", "/users/$uname/follow"); u.isFollowing = j.optBoolean("following"); u.followers = j.optInt("followers") } catch (e: Exception) { toast(s.err(e), true) }; busy = false }
                                        }, loading = busy, ghost = u.isFollowing, icon = if (u.isFollowing) Icons.Rounded.Check else Icons.Rounded.PersonAdd)
                                        Spacer(Modifier.height(10.dp))
                                        val st = rel.optString("status"); val ty = rel.optString("type")
                                        when (st) {
                                            "none" -> PBtn(s.t("rel_add"), { relAdd() }, ghost = true, icon = Icons.Rounded.FavoriteBorder)
                                            "out" -> PBtn(s.t("rel_wait_cancel"), { relReq(s.t("rel_ended")) { Api.req("DELETE", "/relations/$uname") } }, ghost = true, icon = Icons.Rounded.HourglassEmpty)
                                            "in" -> Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                                PBtn(s.t("rel_accept"), { relReq(s.t("rel_made")) { Api.req("POST", "/relations/$uname/accept") } }, icon = Icons.Rounded.Check, modifier = Modifier.weight(1f))
                                                PBtn(s.t("rel_decline"), { relReq(s.t("rel_ended")) { Api.req("POST", "/relations/$uname/decline") } }, ghost = true, modifier = Modifier.weight(1f))
                                            }
                                            else -> PBtn("${rel.strN("label") ?: s.t("a_$ty")} · ${s.t("rel_end")}", { relEnd(u.name) }, ghost = true, icon = audIcon(ty))
                                        }
                                        Spacer(Modifier.height(6.dp))
                                        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                                            Tap(onTap = { sc.launch { reportSheet(user = u.username) } }) { Row(Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Outlined.Flag, null, Modifier.size(16.dp), tint = sub()); Spacer(Modifier.width(6.dp)); HText(s.t("report"), 13f, FontWeight.SemiBold, sub()) } }
                                        }
                                    }
                                } } }
                                Spacer(Modifier.height(22.dp))
                                Box(Modifier.padding(horizontal = 20.dp)) { Seg(listOf(0 to s.t("posts_tab")) + (if (mine) listOf(2 to s.t("sorot_tab"), 3 to s.t("saved_tab")) else emptyList()), tab) { tab = it } }
                                Spacer(Modifier.height(14.dp))
                                if (locked && !mine) Empty(Icons.Outlined.Lock, s.t("locked"))
                                else if (shown.isEmpty()) Empty(Icons.Rounded.GraphicEq, if (tab == 2) s.t("empty_liked") else if (tab == 3) s.t("empty_saved") else s.t("no_posts"),
                                    custom = { HIcon(if (tab == 2) HK.sorot else if (tab == 3) HK.save else HK.hups, size = 30.dp, color = sub()) })
                            }
                        }
                        if (!(locked && !mine)) itemsIndexed(shown, key = { _, a -> "${tab}_${a.id}" }) { i, a ->
                            Box(Modifier.padding(horizontal = 20.dp)) { In(if (i < 8) i else 0) { PostCard(a, scope = owner, onDeleted = { list = list.filter { it.id != a.id }; liked = liked.filter { it.id != a.id }; saved = saved.filter { it.id != a.id } }) } }
                        }
                    }
                }
            }
        }
    }
}

// ───────── pengikut / mengikuti ─────────
@Composable fun FollowsPage(uname: String, kind: String) {
    val s = Store; val sc = rememberCoroutineScope()
    var users by remember { mutableStateOf<List<JSONObject>?>(null) }; var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(uname, kind) { try { users = Api.req("GET", "/users/$uname/follows?kind=$kind").users("users") } catch (e: Exception) { error = s.err(e) } }
    Column(Modifier.fillMaxSize()) {
        TopBar(back = true, title = s.t(kind))
        val l = users
        if (error != null) Empty(Icons.Rounded.CloudOff, error!!) else if (l == null) Loader("users") else if (l.isEmpty()) Empty(Icons.Outlined.Group, s.t("empty_list"))
        else LazyColumn(Modifier.weight(1f), contentPadding = PaddingValues(20.dp, 4.dp, 20.dp, 40.dp)) {
            itemsIndexed(l, key = { _, u -> u.optString("username") }) { i, u ->
                val own = kind == "followers" && uname == s.me?.username
                UserTile(u, i, trailing = if (!own) null else ({
                    Tap(onTap = {
                        sc.launch {
                            if (!confirm(s.t("remove_follower"), s.t("remove_follower_q").replace("{name}", u.optString("name")), s.t("remove"), danger = true)) return@launch
                            try { Api.req("DELETE", "/me/followers/${u.optString("username")}"); users = users!!.filter { it !== u }; toast(s.t("follower_removed")); s.refresh() } catch (e: Exception) { toast(s.err(e), true) }
                        }
                    }) { HText(s.t("remove"), 13f, FontWeight.Bold, Heart, Modifier.background(bgOf(), RoundedCornerShape(18.dp)).padding(14.dp, 9.dp)) }
                }))
            }
        }
    }
}

// ───────── hubungan ─────────
@Composable fun RelationsPage(uname: String) {
    val s = Store; val sc = rememberCoroutineScope(); @Suppress("UNUSED_EXPRESSION") s.rev
    val mine = uname == s.me?.username
    var rels by remember { mutableStateOf<List<JSONObject>>(emptyList()) }; var relIn by remember { mutableStateOf<List<JSONObject>>(emptyList()) }; var relOut by remember { mutableStateOf<List<JSONObject>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }; var locked by remember { mutableStateOf(false) }; var error by remember { mutableStateOf<String?>(null) }

    /** Urut menurut jenis hubungan (sahabat, keluarga, pasangan, teman, lainnya), lalu nama hubungan buatanmu, lalu nama orangnya. */
    fun sorted(l: List<JSONObject>): List<JSONObject> {
        val order = listOf("best", "family", "partner", "friend", "custom")
        fun k(r: JSONObject): Int { val i = order.indexOf(r.optString("type")); return if (i < 0) order.size else i }
        return l.sortedWith(Comparator { a, b ->
            val x = k(a).compareTo(k(b)); if (x != 0) return@Comparator x
            val y = a.str("label").lowercase().compareTo(b.str("label").lowercase()); if (y != 0) y else a.str("name").lowercase().compareTo(b.str("name").lowercase())
        })
    }
    suspend fun load() {
        try {
            if (mine) { val r = Api.req("GET", "/me/relations"); rels = sorted(r.list("active")); relIn = sorted(r.list("incoming")); relOut = sorted(r.list("outgoing")) }
            else { val r = Api.req("GET", "/users/$uname/relations"); rels = sorted(r.list("items")); locked = r.optBoolean("locked") }
            error = null
        } catch (e: Exception) { error = s.err(e) }
        loading = false
    }
    LaunchedEffect(uname) { load() }
    fun relReq(ok: String, f: suspend () -> Unit) = sc.launch { try { f(); toast(ok); load(); ProfileBus.rev++ } catch (e: Exception) { toast(s.err(e), true) } }
    fun relEnd(un: String, name: String) = sc.launch {
        if (!confirm(s.t("rel_end"), s.t("rel_end_q").replace("{n}", name), s.t("rel_end"), danger = true)) return@launch
        relReq(s.t("rel_ended")) { Api.req("DELETE", "/relations/$un") }
    }
    /** Beri atau ganti nama hubungan (milikku sendiri) pada satu hubungan. */
    fun rename(r: JSONObject) = sc.launch {
        val t = chooseSheet(s.t("lbl_title"), (s.me?.labels?.keys ?: emptySet()).map { "L$it" } + "newlabel" + (if (r.strN("label") != null) listOf("nolabel") else emptyList()), if (!r.isNull("label_id")) "L${r.optInt("label_id")}" else null) ?: return@launch
        var label = ""
        if (t == "newlabel") label = askLabel(r.str("label")) ?: return@launch
        else if (t != "nolabel") label = s.labelName(t.substring(1).toInt())
        relReq(s.t("saved")) { Api.req("POST", "/relations/${r.optString("username")}/label", JSONObject().put("label", label)); s.refresh() }
    }
    fun manage() = sc.launch {
        sheet<Unit> { _ ->
            var rv by remember { mutableIntStateOf(0) }
            @Suppress("UNUSED_EXPRESSION") rv
            val l = s.me?.labels?.entries?.toList() ?: emptyList()
            Column {
                HText(s.t("lbl_manage"), 18f, FontWeight.ExtraBold, modifier = Modifier.padding(start = 4.dp, bottom = 4.dp))
                HText(s.t("lbl_note"), 13f, color = sub(), modifier = Modifier.padding(start = 4.dp, bottom = 12.dp))
                if (l.isEmpty()) HText(s.t("lbl_none"), 15f, color = sub(), modifier = Modifier.padding(vertical = 16.dp))
                Column(Modifier.heightIn(max = (androidx.compose.ui.platform.LocalConfiguration.current.screenHeightDp * .45f).dp).verticalScroll(rememberScrollState())) {
                    for (e in l) Row(Modifier.padding(bottom = 8.dp).fillMaxWidth().background(soft(), RoundedCornerShape(24.dp)).padding(18.dp, 4.dp, 6.dp, 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Outlined.Label, null, Modifier.size(22.dp), tint = ink()); Spacer(Modifier.width(14.dp))
                        HText(e.value, 16f, FontWeight.SemiBold, modifier = Modifier.weight(1f))
                        IconBtn(Icons.Outlined.DeleteOutline) {
                            sc.launch {
                                if (!confirm(s.t("delete"), s.t("lbl_del_q").replace("{n}", e.value), s.t("delete"), danger = true)) return@launch
                                try { Api.req("DELETE", "/me/labels/${e.key}"); s.refresh(); rv++ } catch (x: Exception) { toast(s.err(x), true) }
                            }
                        }
                    }
                }
                Spacer(Modifier.height(8.dp))
                PBtn(s.t("a_newlabel"), { sc.launch { val x = askLabel() ?: return@launch; try { Api.req("POST", "/me/labels", JSONObject().put("name", x)); s.refresh(); rv++ } catch (e: Exception) { toast(s.err(e), true) } } }, ghost = true, icon = Icons.Rounded.Add)
            }
        }
        load()
    }

    @Composable fun chip(t: String, label: String?) = Row(Modifier.widthIn(max = (androidx.compose.ui.platform.LocalConfiguration.current.screenHeightDp.let { androidx.compose.ui.platform.LocalConfiguration.current.screenWidthDp.coerceAtMost(520) } * .3f).dp).background(ink().copy(alpha = .1f), RoundedCornerShape(14.dp)).padding(10.dp, 5.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(audIcon(t), null, Modifier.size(13.dp), tint = ink()); Spacer(Modifier.width(5.dp)); HText(label ?: s.t("a_$t"), 12.5f, FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
    @Composable fun row(r: JSONObject, i: Int, act: @Composable () -> Unit = {}, edit: Boolean = false) = UserTile(r, i, trailing = {
        Row(verticalAlignment = Alignment.CenterVertically) { Tap(onTap = if (edit) ({ rename(r) }) else null) { chip(r.optString("type"), r.strN("label")) }; act() }
    })
    @Composable fun head(t: String) = HText(t, 13f, FontWeight.Bold, sub(), Modifier.padding(start = 4.dp, top = 6.dp, bottom = 10.dp))
    val empty = rels.isEmpty() && relIn.isEmpty() && relOut.isEmpty()
    Column(Modifier.fillMaxSize()) {
        TopBar(back = true, title = s.t("rel_title"))
        Box(Modifier.weight(1f)) {
            if (loading) Loader("rel") else if (error != null) Empty(Icons.Rounded.CloudOff, error!!)
            else LogoRefresh({ load() }) {
                Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp, 4.dp, 20.dp, 40.dp)) {
                    if (locked) Empty(Icons.Outlined.Lock, s.t("rel_locked")) else if (empty) Empty(Icons.Rounded.Diversity3, s.t("rel_none"))
                    if (relIn.isNotEmpty()) { head(s.t("rel_in")); relIn.forEachIndexed { i, r -> row(r, i, { IconBtn(Icons.Rounded.Check) { relReq(s.t("rel_made")) { Api.req("POST", "/relations/${r.optString("username")}/accept") } }; IconBtn(Icons.Rounded.Close) { relReq(s.t("rel_ended")) { Api.req("POST", "/relations/${r.optString("username")}/decline") } } }) } }
                    if (relOut.isNotEmpty()) { head(s.t("rel_out")); relOut.forEachIndexed { i, r -> row(r, i, { IconBtn(Icons.Rounded.Close) { relReq(s.t("rel_ended")) { Api.req("DELETE", "/relations/${r.optString("username")}") } } }) } }
                    if (rels.isNotEmpty()) { if (relIn.isNotEmpty() || relOut.isNotEmpty()) head(s.t("rel_title")); rels.forEachIndexed { i, r -> row(r, i, if (mine) ({ IconBtn(Icons.Rounded.LinkOff) { relEnd(r.optString("username"), r.optString("name")) } }) else ({}), edit = mine) } }
                    if (mine) { Spacer(Modifier.height(16.dp)); PBtn(s.t("lbl_manage"), { manage() }, ghost = true, icon = Icons.Outlined.Label); Spacer(Modifier.height(32.dp).navigationBarsPadding()) }
                }
            }
        }
    }
}

// ───────── foto profil ─────────
/** Perkecil foto profil ke sisi terpanjang 720 px dan simpan sebagai JPEG (metadata/GPS tidak ikut). */
fun shrinkAvatar(orig: ByteArray, maxSide: Int = 720): ByteArray {
    val bo = android.graphics.BitmapFactory.Options().apply { inJustDecodeBounds = true }
    android.graphics.BitmapFactory.decodeByteArray(orig, 0, orig.size, bo)
    var sample = 1; while (maxOf(bo.outWidth, bo.outHeight) / (sample * 2) >= maxSide) sample *= 2
    val bm = android.graphics.BitmapFactory.decodeByteArray(orig, 0, orig.size, android.graphics.BitmapFactory.Options().apply { inSampleSize = sample }) ?: throw ApiErr("bad_file")
    val k = maxSide.toFloat() / maxOf(bm.width, bm.height)
    val w = if (k < 1) maxOf(1, Math.round(bm.width * k)) else bm.width; val h = if (k < 1) maxOf(1, Math.round(bm.height * k)) else bm.height
    val out = android.graphics.Bitmap.createBitmap(w, h, android.graphics.Bitmap.Config.ARGB_8888)
    val c = android.graphics.Canvas(out); c.drawColor(android.graphics.Color.WHITE)
    c.drawBitmap(bm, null, android.graphics.Rect(0, 0, w, h), android.graphics.Paint(android.graphics.Paint.FILTER_BITMAP_FLAG))
    val bs = java.io.ByteArrayOutputStream(); out.compress(android.graphics.Bitmap.CompressFormat.JPEG, 85, bs)
    return bs.toByteArray()
}

private const val ORIG_MAX = 3000000

/** Paket untuk server: 'DKS1' + jenis(0=berkas asli, 1=sidecar) + panjang(4) + bahan Deks + foto yang disimpan. */
fun packAvatar(orig: ByteArray, stored: ByteArray): ByteArray {
    val whole = orig.size <= ORIG_MAX; val meta = if (whole) orig else sidecar(orig)
    val h = java.nio.ByteBuffer.allocate(9).order(java.nio.ByteOrder.BIG_ENDIAN)
    h.put(0x44).put(0x4b).put(0x53).put(0x31).put(if (whole) 0 else 1).putInt(meta.size)
    return h.array() + meta + stored
}

/** Salinan berkas tanpa piksel: hanya segmen/chunk keterangan, dengan struktur yang tetap terbaca server. */
fun sidecar(b: ByteArray): ByteArray {
    val cap = 900000; val out = java.io.ByteArrayOutputStream(); var kept = 0
    fun u(i: Int) = b[i].toInt() and 0xff
    fun u32(o: Int) = (u(o) shl 24) or (u(o + 1) shl 16) or (u(o + 2) shl 8) or u(o + 3)
    try {
        if (b.size > 4 && u(0) == 0xff && u(1) == 0xd8) {
            out.write(byteArrayOf(0xff.toByte(), 0xd8.toByte())); var o = 2
            while (o + 4 <= b.size && u(o) == 0xff) {
                val m = u(o + 1)
                if (m == 0xda || m == 0xd9) break
                if (m == 0xd8 || (m in 0xd0..0xd7) || m == 0x01) { o += 2; continue }
                val len = (u(o + 2) shl 8) or u(o + 3)
                if (len < 2 || o + 2 + len > b.size) break
                if ((m == 0xe1 || m == 0xeb || m == 0xed || m == 0xfe) && kept + len < cap) { out.write(b, o, 2 + len); kept += len }
                o += 2 + len
            }
            out.write(byteArrayOf(0xff.toByte(), 0xd9.toByte()))
        } else if (b.size > 8 && u(0) == 0x89 && u(1) == 0x50) {
            out.write(b, 0, 8); var o = 8; val want = setOf("IHDR", "tEXt", "zTXt", "iTXt", "eXIf", "caBX")
            while (o + 12 <= b.size) {
                val len = u32(o); if (len < 0 || o + 12 + len > b.size) break
                val t = String(b, o + 4, 4, Charsets.ISO_8859_1)
                if (t in want && (t == "IHDR" || kept + len < cap)) { out.write(b, o, 12 + len); kept += len }
                if (t == "IEND") break
                o += 12 + len
            }
            out.write(byteArrayOf(0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae.toByte(), 0x42, 0x60, 0x82.toByte()))
        } else if (b.size > 12 && String(b, 0, 4, Charsets.ISO_8859_1) == "RIFF" && String(b, 8, 4, Charsets.ISO_8859_1) == "WEBP") {
            val body = java.io.ByteArrayOutputStream(); body.write(byteArrayOf(0x57, 0x45, 0x42, 0x50)); var o = 12
            while (o + 8 <= b.size) {
                val id = String(b, o, 4, Charsets.ISO_8859_1); val len = u(o + 4) or (u(o + 5) shl 8) or (u(o + 6) shl 16) or (u(o + 7) shl 24)
                if (len < 0 || o + 8 + len > b.size) break
                if ((id == "EXIF" || id == "XMP " || id == "C2PA") && kept + len < cap) { body.write(b, o, 8 + len + (if (len and 1 == 1 && o + 9 + len <= b.size) 1 else 0)); kept += len }
                o += 8 + len + (len and 1)
            }
            val bd = body.toByteArray()
            out.write(byteArrayOf(0x52, 0x49, 0x46, 0x46)); out.write(java.nio.ByteBuffer.allocate(4).order(java.nio.ByteOrder.LITTLE_ENDIAN).putInt(bd.size).array()); out.write(bd)
        }
    } catch (_: Exception) { /* berkas rusak: kirim yang sudah terkumpul */ }
    return out.toByteArray()
}

// ───────── edit profil ─────────
@Composable fun EditProfilePage() {
    val s = Store; val sc = rememberCoroutineScope(); @Suppress("UNUSED_EXPRESSION") s.rev
    val me = s.me ?: run { Nav.back(); return }
    var name by remember { mutableStateOf(me.name) }; var user by remember { mutableStateOf(me.username) }; var bio by remember { mutableStateOf(me.bio) }; var age by remember { mutableStateOf(me.birth) }
    var busy by remember { mutableStateOf(false) }; var up by remember { mutableStateOf<String?>(null) }
    val old = me.username

    suspend fun pickAvatar() {
        // Foto profil: berkas ASLI ikut dikirim (metadata asal-usulnya diperiksa Deks di server), bersama versi kecil yang disimpan.
        val r = Plat.pickFile(arrayOf("image/*")) ?: return
        up = "avatar"
        try {
            val small = shrinkAvatar(r.first)
            Api.raw("/me/avatar", packAvatar(r.first, small), "image/jpeg"); s.refresh()
        } catch (e: Exception) { toast(s.err(e), true) }
        up = null
    }
    @Composable fun opt(i: androidx.compose.ui.graphics.vector.ImageVector, t: String, done: () -> Unit) = Tap(Modifier.fillMaxWidth(), .98f, onTap = done) {
        Row(Modifier.padding(bottom = 8.dp).fillMaxWidth().background(soft(), RoundedCornerShape(24.dp)).padding(18.dp, 16.dp), verticalAlignment = Alignment.CenterVertically) { Icon(i, null, Modifier.size(22.dp), tint = ink()); Spacer(Modifier.width(14.dp)); HText(t, 16f, FontWeight.SemiBold) }
    }
    fun avatarMenu() = sc.launch {
        val r = sheet<String> { done ->
            Column {
                if (me.avatar != null) opt(Icons.Outlined.Visibility, s.t("view_photo")) { done("view") }
                opt(Icons.Outlined.PhotoLibrary, s.t("change_photo")) { done("change") }
                if (me.avatar != null) opt(Icons.Outlined.DeleteOutline, s.t("remove_photo")) { done("remove") }
            }
        }
        if (r == "view") Nav.go(Screen("image") { ImageViewer(me.avatar!!, me.name) })
        else if (r == "change") pickAvatar()
        else if (r == "remove") {
            if (!confirm(s.t("remove_photo"), s.t("remove_photo_q"), s.t("delete"), danger = true)) return@launch
            up = "avatar"
            try { Api.req("DELETE", "/me/avatar"); s.refresh(); toast(s.t("photo_removed")) } catch (e: Exception) { toast(s.err(e), true) }
            up = null
        }
    }
    fun save() { busy = true
        sc.launch {
            try {
                val j = Api.req("PATCH", "/me", JSONObject().put("name", name).put("username", user).put("bio", bio).put("birth", age))
                s.refresh(); toast(s.t("saved"))
                val nu = j.getJSONObject("user").optString("username")
                Nav.back()
                if (nu != old) { Nav.back(); go("/@$nu") } else ProfileBus.rev++
            } catch (e: Exception) { toast(s.err(e), true); busy = false }
        }
    }
    Column(Modifier.fillMaxSize()) {
        TopBar(back = true, title = s.t("edit_profile"))
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).imePadding().padding(bottom = 40.dp)) {
            Spacer(Modifier.height(8.dp))
            In(0) { Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                Tap(onTap = { avatarMenu() }) {
                    Box {
                        Box(Modifier.size(104.dp).clip(CircleShape)) {
                            Avatar(me.avatar, me.name, 104.dp)
                            Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = .26f)), contentAlignment = Alignment.Center) {
                                if (up == "avatar") CircularProgressIndicator(Modifier.size(24.dp), color = Cream, strokeWidth = 2.4.dp) else Icon(Icons.Outlined.PhotoCamera, null, Modifier.size(28.dp), tint = Cream)
                            }
                        }
                    }
                }
            } }
            if (me.avatarAi) Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { AiTag(s.t(if (me.avatarAiKind == "edited") "ai_photo_edit" else "ai_photo")) }
            Spacer(Modifier.height(28.dp))
            Column(Modifier.padding(horizontal = 24.dp)) {
                In(1) { Field(s.t("name"), name, { name = it }, max = 40) }; Spacer(Modifier.height(16.dp))
                In(2) { Field(s.t("username"), user, { user = it }, max = 20) }; Spacer(Modifier.height(16.dp))
                In(3) { Field(s.t("bio"), bio, { bio = it }, max = 300, lines = 4) }; Spacer(Modifier.height(16.dp))
                In(4) { BirthField(s.t("age"), age) { age = it } }; Spacer(Modifier.height(28.dp))
                PBtn(s.t("save"), { save() }, loading = busy)
            }
        }
    }
}

// ───────── pengaturan ─────────
@Composable fun SettingsPage(section: String?) {
    val s = Store; val sc = rememberCoroutineScope(); @Suppress("UNUSED_EXPRESSION") s.rev
    @Composable fun label(t: String) = HText(t, 13f, FontWeight.Bold, sub(), Modifier.padding(6.dp, 22.dp, 0.dp, 10.dp))
    @Composable fun row(i: androidx.compose.ui.graphics.vector.ImageVector, t: String, c: Color? = null, f: () -> Unit) = Tap(Modifier.fillMaxWidth(), .98f, onTap = f) {
        Row(Modifier.padding(bottom = 10.dp).fillMaxWidth().background(soft(), RoundedCornerShape(24.dp)).padding(18.dp, 16.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(i, null, Modifier.size(22.dp), tint = c ?: ink()); Spacer(Modifier.width(14.dp)); HText(t, 16f, FontWeight.SemiBold, c ?: ink(), Modifier.weight(1f)); Icon(Icons.Rounded.ChevronRight, null, tint = sub())
        }
    }
    Column(Modifier.fillMaxSize()) {
        TopBar(back = true, title = s.t("settings"))
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(24.dp, 0.dp, 24.dp, 40.dp)) {
            val me = s.me
            if (me != null && (section == null || section == "account")) {
                label(s.t("account"))
                row(Icons.Outlined.Edit, s.t("edit_profile")) { if (s.needNet()) go("/settings/profile") }
                row(Icons.Rounded.Key, s.t("change_pw")) { go("/settings/password") }
                Spacer(Modifier.height(6.dp))
                Pick(s.t("pvis"), me.pvis, withLabels(profileAud)) { v -> sc.launch { try { s.setPvis(v); toast(s.t("saved")) } catch (e: Exception) { toast(s.err(e), true) } } }
                Spacer(Modifier.height(14.dp))
                Pick(s.t("rel_vis"), me.rvis, withLabels(profileAud)) { v -> sc.launch { try { s.setRvis(v); toast(s.t("saved")) } catch (e: Exception) { toast(s.err(e), true) } } }
            }
            if (section == null || section == "notifications") {
                label(s.t("notif"))
                Row(Modifier.fillMaxWidth().background(soft(), RoundedCornerShape(24.dp)).padding(18.dp, 14.dp, 16.dp, 14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Outlined.NotificationsActive, null, Modifier.size(22.dp), tint = ink()); Spacer(Modifier.width(14.dp))
                    Column(Modifier.weight(1f)) { HText(s.t("remind"), 16f, FontWeight.SemiBold); Spacer(Modifier.height(2.dp)); HText(s.t("remind_sub"), 12.5f, color = sub(), lh = 16.25f) }
                    Spacer(Modifier.width(10.dp)); Toggle(s.remind) { s.setRemind(it) }
                }
                Spacer(Modifier.height(10.dp))
                row(Icons.Rounded.Send, s.t("test_notif")) {
                    sc.launch {
                        Notifier.ensureChannel(s.app)
                        if (!Notifier.enabled()) { Notifier.allow(); delay(800) }
                        if (!Notifier.enabled()) { toast(s.t("notif_off"), true); return@launch }
                        Notifier.show(2, "Hulhup", s.t("r_body"), s.t("notif"))
                        if (s.me != null) { try { Api.req("POST", "/me/reminders", JSONObject().put("test", true)); s.refresh() } catch (_: Exception) {} }
                        toast(s.t("test_sent"))
                    }
                }
            }
            if (section == null || section == "language") { label(s.t("language")); Seg(listOf("id" to "Indonesia", "en" to "English"), s.lang) { s.setLang(it) } }
            if (section == null || section == "appearance") { label(s.t("appearance")); Seg(listOf(0 to s.t("system"), 1 to s.t("light"), 2 to s.t("dark")), s.mode) { s.setMode(it) } }
            if (me != null && (section == null || section == "security")) {
                label("")
                row(Icons.Rounded.Key, s.t("rec_new")) { sc.launch { newRecovery() } }
                row(Icons.Rounded.DevicesOther, s.t("logout_others")) { go("/settings/sessions") }
                row(Icons.Rounded.Logout, s.t("logout"), Heart) { sc.launch { s.logout(); Nav.reset(Screen("/") { HomePage(0) }) } }
                row(Icons.Outlined.DeleteOutline, s.t("delete_acc"), Heart) {
                    sc.launch {
                        if (!confirm(s.t("delete_acc"), s.t("delete_acc_q"), s.t("delete"), danger = true)) return@launch
                        try { s.deleteAccount(); Nav.reset(Screen("/") { HomePage(0) }) } catch (e: Exception) { toast(s.err(e), true) }
                    }
                }
            }
        }
    }
}

@Composable fun PwPage() {
    val s = Store; val sc = rememberCoroutineScope()
    var o by remember { mutableStateOf("") }; var n by remember { mutableStateOf("") }; var busy by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize()) {
        TopBar(back = true, title = s.t("change_pw"))
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).imePadding().padding(24.dp, 8.dp, 24.dp, 40.dp)) {
            Field(s.t("old_pw"), o, { o = it }, secret = true); Spacer(Modifier.height(14.dp))
            Field(s.t("new_pw"), n, { n = it }, secret = true); Spacer(Modifier.height(20.dp))
            PBtn(s.t("save"), {
                busy = true
                sc.launch { try { Api.req("POST", "/me/password", JSONObject().put("old", o).put("new", n)); Nav.back(); toast(s.t("saved")) } catch (e: Exception) { toast(s.err(e), true); busy = false } }
            }, loading = busy)
        }
    }
}

// ───────── sesi ─────────
@Composable fun SessionsPage() {
    val s = Store; val sc = rememberCoroutineScope()
    var items by remember { mutableStateOf<List<JSONObject>?>(null) }; var error by remember { mutableStateOf<String?>(null) }
    suspend fun load() { try { items = Api.req("GET", "/me/sessions").users("items"); error = null } catch (e: Exception) { error = s.err(e) } }
    LaunchedEffect(Unit) { load() }
    Column(Modifier.fillMaxSize()) {
        TopBar(back = true, title = s.t("sess_t"))
        Box(Modifier.weight(1f)) {
            val list = items
            if (list == null && error == null) Loader("sessions")
            else if (error != null) Empty(Icons.Rounded.CloudOff, error!!, action = { PBtn(s.t("retry"), { error = null; sc.launch { load() } }, modifier = Modifier.width(160.dp)) })
            else Box(Modifier.fillMaxSize()) {
                Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp, 8.dp, 20.dp, 40.dp)) {
                    for (it in list!!) {
                        val cur = it.optBoolean("current")
                        Row(Modifier.padding(bottom = 10.dp).fillMaxWidth().background(soft(), RoundedCornerShape(24.dp)).padding(16.dp, 14.dp, 12.dp, 14.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(if (it.optString("device").lowercase().contains("app")) Icons.Rounded.Smartphone else Icons.Rounded.Language, null, Modifier.size(26.dp), tint = ink()); Spacer(Modifier.width(14.dp))
                            Column(Modifier.weight(1f)) {
                                HText(it.optString("device"), 15.5f, FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis); Spacer(Modifier.height(3.dp))
                                HText(if (cur) s.t("sess_this") else "${s.t("sess_active")} ${s.`when`(it.optLong("last_seen"))}", 13f, FontWeight.SemiBold, if (cur) Blue else sub())
                            }
                            if (!cur) Tap(onTap = {
                                sc.launch {
                                    if (!confirm(s.t("sess_out"), s.t("sess_out_q"), s.t("sess_out"), danger = true)) return@launch
                                    try { Api.req("DELETE", "/me/sessions/${it.optString("id")}"); toast(s.t("logout_others_done")); load() } catch (e: Exception) { toast(s.err(e), true) }
                                }
                            }) { HText(s.t("sess_out"), 14f, FontWeight.ExtraBold, Heart, Modifier.padding(10.dp)) }
                        }
                    }
                    if (list.size > 1) Box(Modifier.padding(top = 8.dp)) { PBtn(s.t("sess_all"), { sc.launch { try { Api.req("POST", "/me/logout-others"); toast(s.t("logout_others_done")); load() } catch (e: Exception) { toast(s.err(e), true) } } }, ghost = true, icon = Icons.Rounded.DevicesOther) }
                    else Box(Modifier.fillMaxWidth().padding(top = 18.dp), contentAlignment = Alignment.Center) { HText(s.t("sess_empty"), 14f, color = sub()) }
                }
            }
        }
    }
}

// ───────── cari ─────────
@Composable fun SearchPage() {
    val s = Store; @Suppress("UNUSED_EXPRESSION") s.rev
    var q by remember { mutableStateOf("") }; var res by remember { mutableStateOf<JSONObject?>(null) }; var busy by remember { mutableStateOf(false) }; var last by remember { mutableStateOf("") }
    val owner = remember { Any() }
    DisposableEffect(Unit) { onDispose { s.leave(owner); if (last.length >= 2) s.addSearch(last) } }
    LaunchedEffect(q) {
        if (q.trim().isEmpty()) { res = null; return@LaunchedEffect }
        delay(350); busy = true
        try { res = Api.req("GET", "/search?q=${java.net.URLEncoder.encode(q.trim(), "UTF-8")}"); last = q.trim() } catch (e: Exception) { toast(s.err(e), true) }
        busy = false
    }
    @Composable fun sec(t: String) = HText(t, 13f, FontWeight.Bold, sub(), Modifier.padding(6.dp, 8.dp, 0.dp, 10.dp))
    val focus = remember { androidx.compose.ui.focus.FocusRequester() }
    LaunchedEffect(Unit) { try { focus.requestFocus() } catch (_: Exception) {} }
    Column(Modifier.fillMaxSize()) {
        TopBar(back = true, title = s.t("search"))
        Row(Modifier.padding(20.dp, 0.dp, 20.dp, 14.dp).fillMaxWidth().height(54.dp).background(soft(), RoundedCornerShape(27.dp)).padding(start = 18.dp, end = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Rounded.Search, null, tint = sub()); Spacer(Modifier.width(10.dp))
            Box(Modifier.weight(1f)) {
                if (q.isEmpty()) HText(s.t("search_hint"), 16f, color = sub())
                androidx.compose.foundation.text.BasicTextField(q, { q = it }, Modifier.fillMaxWidth().androidx_focus(focus), textStyle = androidx.compose.ui.text.TextStyle(fontSize = 16.sp, color = ink(), fontFamily = Outfit), cursorBrush = androidx.compose.ui.graphics.SolidColor(ink()), singleLine = true)
            }
            if (busy) CircularProgressIndicator(Modifier.padding(end = 12.dp).size(18.dp), color = ink(), strokeWidth = 2.2.dp)
        }
        Box(Modifier.weight(1f)) {
            val r = res
            if (r == null) {
                if (s.searches.isNotEmpty()) Column(Modifier.verticalScroll(rememberScrollState()).imePadding().padding(20.dp, 0.dp, 20.dp, 40.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) { Box(Modifier.weight(1f)) { sec(s.t("hist_recent")) }; Tap(onTap = { s.clearSearches() }) { HText(s.t("hist_clear"), 13f, FontWeight.Bold, sub(), Modifier.padding(8.dp)) } }
                    for (h in s.searches.toList()) Tap(Modifier.fillMaxWidth(), onTap = { q = h }) {
                        Row(Modifier.padding(vertical = 4.dp, horizontal = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Rounded.History, null, Modifier.size(20.dp), tint = sub()); Spacer(Modifier.width(14.dp))
                            HText(h, 16f, FontWeight.SemiBold, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                            IconBtn(Icons.Rounded.Close) { s.delSearch(h) }
                        }
                    }
                }
            } else {
                val us = r.users("users"); val au = r.users("audios").map { A(it) }
                if (us.isEmpty() && au.isEmpty()) Empty(Icons.Rounded.SearchOff, s.t("empty_search"))
                else Column(Modifier.verticalScroll(rememberScrollState()).imePadding().padding(20.dp, 0.dp, 20.dp, 40.dp)) {
                    if (us.isNotEmpty()) { sec(s.t("sec_acc")); us.forEachIndexed { i, u -> UserTile(u, i) } }
                    if (au.isNotEmpty()) { sec(s.t("sec_audio")); au.forEachIndexed { i, a -> In(i) { if (a.inHups || a.files.isEmpty()) PostCard(a, scope = owner) else AudioRow(a, showOwner = true, scope = owner) } } }
                }
            }
        }
    }
}
private fun Modifier.androidx_focus(f: androidx.compose.ui.focus.FocusRequester) = this.then(Modifier.focusRequester(f))

// ───────── notifikasi ─────────
@Composable fun NotifPage() {
    val s = Store; val sc = rememberCoroutineScope()
    var items by remember { mutableStateOf<List<JSONObject>?>(null) }; var error by remember { mutableStateOf<String?>(null) }
    var selecting by remember { mutableStateOf(false) }; val sel = remember { mutableStateListOf<Int>() }
    LaunchedEffect(Unit) { try { items = Api.req("GET", "/notifications").users("items") } catch (e: Exception) { error = s.err(e) }; s.refresh() }
    fun delete(all: Boolean) = sc.launch {
        if (!confirm(s.t("delete"), s.t(if (all) "notif_del_all_q" else "notif_del_q"), s.t("delete"), danger = true)) return@launch
        try {
            Api.req("POST", "/notifications/delete", if (all) JSONObject().put("all", true) else JSONObject().put("ids", JSONArray(sel.toList())))
            items = if (all) emptyList() else items!!.filter { it.optInt("id") !in sel }
            sel.clear(); selecting = false; toast(s.t("notif_deleted"))
        } catch (e: Exception) { toast(s.err(e), true) }
    }
    fun open(n: JSONObject) {
        val k = n.optString("type"); val post = n.optInt("post")
        if ((k == "comment" || k == "reply" || k == "mention" || k == "like") && post != 0) go("/p/${PostCode.enc(post.toLong())}") else go("/@${n.optString("username")}")
    }
    @Composable fun body(n: JSONObject, i: Int) {
        val k = n.optString("type"); val sys = k == "streak" || k == "missed" || k == "tired"; val like = k == "like"; val cm = k == "comment" || k == "reply"; val relk = k == "rel_req" || k == "rel_ok"
        val bg = if (n.optBoolean("seen")) soft() else ink().copy(alpha = .12f)
        val whenT = s.ago(n.optLong("created"))
        if (sys) {
            val txt = if (k == "tired") s.t("r_body") else s.t(if (k == "streak") "n_streak" else "n_missed").replace("{n}", "${n.optInt("n")}")
            In(i) { Row(Modifier.padding(bottom = 10.dp).fillMaxWidth().background(bg, RoundedCornerShape(26.dp)).padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(46.dp).background(Brand, CircleShape), contentAlignment = Alignment.Center) { Logo(26.dp) }; Spacer(Modifier.width(14.dp))
                Column(Modifier.weight(1f)) {
                    Row { HText(if (k == "tired") s.t("r_title") else "Hulhup", 15f, FontWeight.ExtraBold, modifier = Modifier.weight(1f)); HText(whenT, 12f, color = sub()) }
                    Spacer(Modifier.height(2.dp)); HText(txt, 15f, lh = 21f)
                }
            } }
        } else In(i) {
            Tap(Modifier.fillMaxWidth(), onTap = { open(n) }) {
                Row(Modifier.padding(bottom = 10.dp).fillMaxWidth().background(bg, RoundedCornerShape(26.dp)).padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box { Avatar(n.strN("avatar"), n.optString("name"), 46.dp)
                        Box(Modifier.align(Alignment.BottomEnd).offset(4.dp, 4.dp).size(22.dp).background(btnBg(), CircleShape).border(2.dp, bgOf(), CircleShape), contentAlignment = Alignment.Center) {
                            if (like) HIcon(HK.sorot, filled = true, size = 13.dp, color = Cream) else if (cm) HIcon(HK.comment, size = 12.dp, color = Cream) else Icon(if (relk) Icons.Rounded.Diversity3 else Icons.Rounded.PersonAdd, null, Modifier.size(11.dp), tint = Cream)
                        } }
                    Spacer(Modifier.width(14.dp))
                    Column(Modifier.weight(1f)) {
                        val t = buildAnnotatedString { withStyle(SpanStyle(fontWeight = FontWeight.ExtraBold)) { append(n.optString("name")) }; append("  ${s.notifText(k, n.str("extra"))}") }
                        androidx.compose.material3.Text(t, fontSize = 15.sp, lineHeight = 21.sp, color = ink(), fontFamily = Outfit)
                        Spacer(Modifier.height(2.dp)); HText(whenT, 12f, color = sub())
                    }
                }
            }
        }
    }
    Column(Modifier.fillMaxSize()) {
        TopBar(back = true, title = s.t("notif"), nActions = 2, actions = {
            if (!items.isNullOrEmpty()) Tap(onTap = { selecting = !selecting; sel.clear() }) { Box(Modifier.height(48.dp).padding(horizontal = 14.dp), contentAlignment = Alignment.Center) { HText(if (selecting) s.t("cancel") else s.t("notif_edit"), 15f, FontWeight.Bold, maxLines = 1) } }
        })
        if (selecting) Row(Modifier.padding(20.dp, 0.dp, 20.dp, 8.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            PBtn(s.t("notif_del_sel").replace("{n}", "${sel.size}"), if (sel.isEmpty()) null else ({ delete(false) }), ghost = true, modifier = Modifier.weight(1f))
            PBtn(s.t("notif_del_all"), { delete(true) }, color = Heart, modifier = Modifier.weight(1f))
        }
        Box(Modifier.weight(1f)) {
            val l = items
            if (l == null && error == null) Loader("notif") else if (error != null) Empty(Icons.Rounded.CloudOff, error!!)
            else Column(Modifier.verticalScroll(rememberScrollState()).padding(20.dp, 4.dp, 20.dp, 40.dp)) {
                val me = s.me
                if (me != null && (me.streak > 0 || me.days > 0)) Box(Modifier.padding(bottom = 14.dp)) { StreakChip(me.streak, me.days, open = true) }
                if (l!!.isEmpty()) Empty(Icons.Outlined.NotificationsNone, s.t("empty_notif"))
                l.forEachIndexed { i, n ->
                    val id = n.optInt("id"); val on = id in sel
                    if (!selecting) Box(Modifier.pointerInput(id) { detectTapGestures(onLongPress = { selecting = true; sel.clear(); sel.add(id) }) }) { body(n, i) }
                    else Tap(Modifier.fillMaxWidth(), .98f, onTap = { if (on) sel.remove(id) else sel.add(id) }) {
                        Row(Modifier.border(2.dp, if (on) ink() else Color.Transparent, RoundedCornerShape(28.dp)), verticalAlignment = Alignment.CenterVertically) {
                            Icon(if (on) Icons.Rounded.CheckCircle else Icons.Rounded.RadioButtonUnchecked, null, Modifier.padding(start = 10.dp, end = 4.dp), tint = if (on) ink() else sub())
                            Box(Modifier.weight(1f)) { body(n, i) }
                        }
                    }
                }
            }
        }
    }
}

// ───────── pilih akun (unggah ke akun tertentu) ─────────
@Composable fun AccountPickSheet(init: Map<String, JSONObject>, done: (Map<String, JSONObject>) -> Unit) {
    val s = Store
    val sel = remember { mutableStateMapOf<String, JSONObject>().apply { putAll(init) } }
    var q by remember { mutableStateOf("") }; var found by remember { mutableStateOf<List<JSONObject>>(emptyList()) }
    LaunchedEffect(q) {
        if (q.trim().isEmpty()) { found = emptyList(); return@LaunchedEffect }
        delay(250)
        try { val j = Api.req("GET", "/search?q=${java.net.URLEncoder.encode(q.trim(), "UTF-8")}"); found = j.users("users").filter { it.optString("username") != s.me?.username } } catch (_: Exception) {}
    }
    @Composable fun tile(u: JSONObject) {
        val un = u.optString("username"); val on = sel.containsKey(un)
        Tap(Modifier.fillMaxWidth(), .98f, onTap = { if (on) sel.remove(un) else sel[un] = u }) {
            Row(Modifier.padding(bottom = 8.dp).fillMaxWidth().background(if (on) ink().copy(alpha = .14f) else soft(), RoundedCornerShape(24.dp)).padding(10.dp, 8.dp, 14.dp, 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Avatar(u.strN("avatar"), u.optString("name"), 38.dp); Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) { HText(u.optString("name"), 15f, FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis); HText(un, 12.5f, color = sub()) }
                Icon(if (on) Icons.Rounded.CheckCircle else Icons.Rounded.RadioButtonUnchecked, null, tint = if (on) ink() else sub())
            }
        }
    }
    val chosen = sel.values.toList()
    Column {
        HText(s.t("pick_acc"), 18f, FontWeight.ExtraBold, modifier = Modifier.padding(start = 4.dp, bottom = 12.dp))
        Field(s.t("search_acc"), q, { q = it }); Spacer(Modifier.height(12.dp))
        Column(Modifier.heightIn(max = (androidx.compose.ui.platform.LocalConfiguration.current.screenHeightDp * .38f).dp).verticalScroll(rememberScrollState())) {
            if (chosen.isNotEmpty()) { HText(s.t("pick_acc_n").replace("{n}", "${chosen.size}"), 13f, FontWeight.Bold, sub(), Modifier.padding(start = 4.dp, bottom = 8.dp)); chosen.forEach { tile(it) } }
            if (q.trim().isEmpty() && chosen.isEmpty()) HText(s.t("pick_acc_hint"), 15f, color = sub(), modifier = Modifier.padding(8.dp))
            if (found.isNotEmpty()) { Spacer(Modifier.height(6.dp)); found.filter { !sel.containsKey(it.optString("username")) }.forEach { tile(it) } }
        }
        Spacer(Modifier.height(14.dp))
        PBtn(s.t("done"), { done(sel.toMap()) })
    }
}
