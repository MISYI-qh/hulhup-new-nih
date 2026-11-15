@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package app.misyi.hulhup

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.*
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.pulltorefresh.PullToRefreshDefaults
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

val Fire = Color(0xFFE8833A)

/** Tarik untuk menyegarkan dengan logo bergerak (padanan LogoRefresh). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable fun LogoRefresh(onRefresh: suspend () -> Unit, content: @Composable BoxScope.() -> Unit) {
    val sc = rememberCoroutineScope(); var refreshing by remember { mutableStateOf(false) }
    PullToRefreshBox(refreshing, { sc.launch { refreshing = true; onRefresh(); refreshing = false } }, indicator = {
        PullToRefreshDefaults.Indicator(Modifier.align(Alignment.TopCenter), state = it, isRefreshing = refreshing, containerColor = Color.Transparent, color = Color.Transparent)
        if (refreshing || it.distanceFraction > .3f) Box(Modifier.align(Alignment.TopCenter).padding(top = 10.dp)) { LogoLoop(34.dp) }
    }, content = content)
}

fun JSONObject.users(k: String): List<JSONObject> = optJSONArray(k)?.objects() ?: emptyList()

// ───────── teks ─────────
@Composable fun TextPage(title: String, body: String) = Column(Modifier.fillMaxSize()) {
    TopBar(back = true, title = title)
    Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(24.dp, 8.dp, 24.dp, 40.dp)) { In(0) { HText(body, 16f, lh = 27.2f) } }
}

// ───────── masuk / daftar ─────────
@Composable fun AuthPage() {
    val s = Store; val sc = rememberCoroutineScope()
    var reg by remember { mutableStateOf(false) }; var busy by remember { mutableStateOf(false) }
    var name by remember { mutableStateOf("") }; var user by remember { mutableStateOf("") }; var pw by remember { mutableStateOf("") }; var age by remember { mutableStateOf("") }
    fun go() {
        busy = true
        sc.launch {
            try {
                if (reg) {
                    val rj = s.auth("/register", JSONObject().put("name", name).put("username", user).put("password", pw).put("birth", age))
                    showRecoveryCode(rj.optString("recovery"))
                } else s.auth("/login", JSONObject().put("username", user).put("password", pw))
                Nav.back(); toast("${s.t("welcome")}, ${s.me!!.name}")
            } catch (e: Exception) { toast(s.err(e), true); busy = false }
        }
    }
    Column(Modifier.fillMaxSize()) {
        TopBar(back = true, center = { HBrand() })
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).imePadding().padding(24.dp, 12.dp, 24.dp, 40.dp)) {
            In(0) { Seg(listOf(false to s.t("login"), true to s.t("register")), reg) { reg = it } }
            Spacer(Modifier.height(24.dp))
            Column(Modifier.animateContentSize(tween(320, easing = FastOutSlowInEasing))) {
                if (reg) { Field(s.t("name"), name, { name = it }, max = 40); Spacer(Modifier.height(16.dp)) }
                Field(s.t("username"), user, { user = it }, max = 20)
                Spacer(Modifier.height(16.dp))
                Field(s.t("password"), pw, { pw = it }, secret = true)
                if (reg) { Spacer(Modifier.height(16.dp)); BirthField(s.t("age"), age) { age = it } }
            }
            Spacer(Modifier.height(28.dp))
            PBtn(if (reg) s.t("register") else s.t("login"), { go() }, loading = busy)
            if (!reg) Box(Modifier.fillMaxWidth().padding(top = 14.dp), contentAlignment = Alignment.Center) {
                Tap(onTap = { go("/recover") }) { HText(s.t("forgot"), 15f, FontWeight.Bold, acc(), Modifier.padding(8.dp)) }
            }
        }
    }
}

// ───────── lupa kata sandi ─────────
@Composable fun RecoverPage() {
    val s = Store; val sc = rememberCoroutineScope()
    var user by remember { mutableStateOf("") }; var code by remember { mutableStateOf("") }; var pw by remember { mutableStateOf("") }; var busy by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize()) {
        TopBar(back = true, title = s.t("recover_title"))
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).imePadding().padding(24.dp, 8.dp, 24.dp, 40.dp)) {
            HText(s.t("recover_hint"), 15f, color = sub(), lh = 21.7f)
            Spacer(Modifier.height(20.dp)); Field(s.t("username"), user, { user = it }, max = 20)
            Spacer(Modifier.height(16.dp)); Field(s.t("recovery_code"), code, { code = it }, max = 14)
            Spacer(Modifier.height(16.dp)); Field(s.t("new_password"), pw, { pw = it }, secret = true)
            Spacer(Modifier.height(28.dp))
            PBtn(s.t("recover_do"), {
                busy = true
                sc.launch {
                    try {
                        val j = Api.req("POST", "/recover", JSONObject().put("username", user).put("code", code).put("password", pw))
                        showRecoveryCode(j.optString("recovery"), fresh = true); Nav.back(); toast(s.t("recover_ok"))
                    } catch (e: Exception) { toast(s.err(e), true); busy = false }
                }
            }, loading = busy)
        }
    }
}

/** Tampilkan kode pemulihan (hanya sekali) dengan tombol salin. */
suspend fun showRecoveryCode(code: String, fresh: Boolean = false) {
    val s = Store
    sheet<Unit> { done ->
        Column {
            HText(s.t(if (fresh) "rec_new" else "rec_show_title"), 18f, FontWeight.ExtraBold)
            Spacer(Modifier.height(8.dp)); HText(s.t("rec_show_note"), 15f, color = sub(), lh = 21f)
            Spacer(Modifier.height(16.dp))
            Box(Modifier.fillMaxWidth().background(soft(), RoundedCornerShape(22.dp)).padding(vertical = 18.dp), contentAlignment = Alignment.Center) {
                androidx.compose.foundation.text.selection.SelectionContainer { HText(code, 24f, FontWeight.ExtraBold, ls = 2f) }
            }
            Spacer(Modifier.height(14.dp))
            PBtn(s.t("rec_copy"), { Plat.copy(code); toast(s.t("link_copied")) }, ghost = true, icon = Icons.Rounded.ContentCopy)
            Spacer(Modifier.height(10.dp))
            PBtn(s.t("rec_saved"), { done(null) }, icon = Icons.Rounded.Check)
        }
    }
}

/** Buat kode pemulihan baru (kode lama hangus) setelah memasukkan kata sandi. */
suspend fun newRecovery() {
    val s = Store
    val pw = sheet<String> { done ->
        var p by remember { mutableStateOf("") }
        Column {
            HText(s.t("rec_new"), 18f, FontWeight.ExtraBold); Spacer(Modifier.height(8.dp))
            HText(s.t("rec_new_note"), 15f, color = sub(), lh = 21f); Spacer(Modifier.height(14.dp))
            Field(s.t("password"), p, { p = it }, secret = true); Spacer(Modifier.height(16.dp))
            PBtn(s.t("rec_new"), { done(p) })
        }
    } ?: return
    try { val j = Api.req("POST", "/me/recovery", JSONObject().put("password", pw)); showRecoveryCode(j.optString("recovery"), fresh = true) } catch (e: Exception) { toast(s.err(e), true) }
}

// ───────── FAQ ─────────
@Composable fun FaqPage() {
    val s = Store; val qa = if (s.lang == "id") FaqData.id else FaqData.en
    Column(Modifier.fillMaxSize()) {
        TopBar(back = true, title = "FAQ")
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(18.dp, 4.dp, 18.dp, 40.dp)) {
            for ((q, a) in qa) {
                var open by remember { mutableStateOf(false) }
                Column(Modifier.padding(bottom = 10.dp).fillMaxWidth().background(soft(), RoundedCornerShape(22.dp)).animateContentSize(tween(220)).padding(horizontal = 18.dp)) {
                    Tap(Modifier.fillMaxWidth(), 1f, onTap = { open = !open }) {
                        Row(Modifier.padding(vertical = 16.dp), verticalAlignment = Alignment.CenterVertically) { HText(q, 15.5f, FontWeight.Bold, modifier = Modifier.weight(1f)); Icon(if (open) Icons.Rounded.ExpandLess else Icons.Rounded.ExpandMore, null, tint = sub()) }
                    }
                    if (open) HText(a, 14.5f, color = sub(), lh = 21.75f, modifier = Modifier.padding(bottom = 16.dp))
                }
            }
        }
    }
}

// ───────── Terkirim ─────────
@Composable fun SentPage(to: String?) {
    val s = Store; var people by remember { mutableStateOf<List<JSONObject>?>(null) }; var posts by remember { mutableStateOf<List<A>>(emptyList()) }; var error by remember { mutableStateOf<String?>(null) }
    val owner = remember { Any() }; DisposableEffect(Unit) { onDispose { s.leave(owner) } }
    LaunchedEffect(to) {
        try {
            if (to == null) people = Api.req("GET", "/me/sent").users("people")
            else { posts = Api.req("GET", "/me/sent?to=${java.net.URLEncoder.encode(to, "UTF-8")}").users("audios").map { A(it) }; people = emptyList() }
        } catch (e: Exception) { error = s.err(e) }
    }
    Column(Modifier.fillMaxSize()) {
        TopBar(back = true, title = if (to == null) s.t("sent_title") else "${s.t("sent_title")} · $to")
        Box(Modifier.weight(1f)) {
            val p = people
            when {
                error != null -> Empty(Icons.Rounded.CloudOff, error!!)
                p == null -> Loader()
                to == null -> if (p.isEmpty()) Empty(Icons.Outlined.Send, s.t("sent_none")) else Column(Modifier.verticalScroll(rememberScrollState()).padding(20.dp, 4.dp, 20.dp, 40.dp)) {
                    HText(s.t("sent_hint"), 13f, color = sub(), modifier = Modifier.padding(start = 6.dp, bottom = 10.dp))
                    p.forEachIndexed { i, u ->
                        In(i) {
                            Tap(Modifier.fillMaxWidth(), .98f, onTap = { go("/sent/${u.optString("username")}") }) {
                                Row(Modifier.padding(bottom = 10.dp).fillMaxWidth().background(soft(), RoundedCornerShape(24.dp)).padding(12.dp, 10.dp, 16.dp, 10.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Avatar(u.strN("avatar"), u.optString("name"), 44.dp); Spacer(Modifier.width(12.dp))
                                    Column(Modifier.weight(1f)) { HText(u.optString("name"), 15.5f, FontWeight.ExtraBold, maxLines = 1, overflow = TextOverflow.Ellipsis); HText(s.t("sent_n").replace("{n}", "${u.optInt("n")}"), 13f, color = sub()) }
                                    Icon(Icons.Rounded.ChevronRight, null, tint = sub())
                                }
                            }
                        }
                    }
                }
                posts.isEmpty() -> Empty(Icons.Outlined.Send, s.t("sent_none"))
                else -> LazyColumn(contentPadding = PaddingValues(20.dp, 4.dp, 20.dp, 40.dp)) { itemsIndexed(posts, key = { _, a -> a.id }) { _, a -> PostCard(a, scope = owner) } }
            }
        }
    }
}

// ───────── pengguna & streak ─────────
@Composable fun UserTile(u: JSONObject, i: Int, trailing: (@Composable () -> Unit)? = null) {
    In(i) {
        Tap(Modifier.fillMaxWidth(), onTap = { go("/@${u.optString("username")}") }) {
            Row(Modifier.padding(bottom = 10.dp).fillMaxWidth().background(soft(), RoundedCornerShape(26.dp)).padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                Avatar(u.strN("avatar"), u.optString("name"), 46.dp); Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) { HText(u.optString("name"), 16f, FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis); HText(u.optString("username"), 13f, color = sub()) }
                if (trailing != null) trailing() else Icon(Icons.Rounded.ChevronRight, null, tint = sub())
            }
        }
    }
}

@Composable fun StreakChip(streak: Int, days: Int, open: Boolean = false) {
    val s = Store
    val box: @Composable () -> Unit = {
        Row(Modifier.background(soft(), RoundedCornerShape(24.dp)).padding(16.dp, 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Rounded.LocalFireDepartment, null, Modifier.size(28.dp), tint = if (streak > 0) Fire else sub()); Spacer(Modifier.width(10.dp))
            Column { HText(s.t("streak_t").replace("{n}", "$streak"), 15f, FontWeight.ExtraBold); if (days > 0) HText(s.t("days_total").replace("{n}", "$days"), 12.5f, color = sub()) }
            if (open) { Spacer(Modifier.width(10.dp)); Icon(Icons.Rounded.CalendarMonth, null, Modifier.size(20.dp), tint = sub()) }
        }
    }
    if (open) Tap(scale = .97f, onTap = { go("/streak") }) { box() } else box()
}

/** Kalender hari masuk: hari masuk, hari yang tidak masuk, dan hari ini. */
@Composable fun StreakPage() {
    val s = Store; var days by remember { mutableStateOf(setOf<String>()) }; var streak by remember { mutableIntStateOf(0) }; var total by remember { mutableIntStateOf(0) }
    var loading by remember { mutableStateOf(true) }; var error by remember { mutableStateOf<String?>(null) }
    val now = java.util.Calendar.getInstance()
    var my by remember { mutableIntStateOf(now.get(java.util.Calendar.YEAR) * 12 + now.get(java.util.Calendar.MONTH)) }
    LaunchedEffect(Unit) {
        try { val j = Api.req("GET", "/me/log"); days = (0 until (j.optJSONArray("days")?.length() ?: 0)).map { j.optJSONArray("days")!!.getString(it) }.toSet(); streak = j.optInt("streak"); total = j.optInt("total") } catch (e: Exception) { error = s.err(e) }
        loading = false
    }
    Column(Modifier.fillMaxSize()) {
        TopBar(back = true, title = s.t("streak_cal"))
        if (loading) Loader() else if (error != null) Empty(Icons.Rounded.CloudOff, error!!) else {
            fun iso(y: Int, m: Int, d: Int) = "%04d-%02d-%02d".format(y, m + 1, d)
            val ty = now.get(java.util.Calendar.YEAR); val tm = now.get(java.util.Calendar.MONTH); val td = now.get(java.util.Calendar.DAY_OF_MONTH)
            val todayKey = ty * 372 + tm * 31 + td
            val sorted = days.sorted(); val first = sorted.firstOrNull()?.split("-")?.let { Triple(it[0].toInt(), it[1].toInt() - 1, it[2].toInt()) }
            val firstKey = first?.let { it.first * 372 + it.second * 31 + it.third }
            val y = my / 12; val m = my % 12
            val wd = if (s.lang == "id") listOf("Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min") else listOf("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
            val n = daysIn(y, m + 1); val lead = (java.util.Calendar.getInstance().apply { clear(); set(y, m, 1) }.get(java.util.Calendar.DAY_OF_WEEK) + 5) % 7
            val canPrev = first != null && my > first.first * 12 + first.second; val canNext = my < ty * 12 + tm
            val missed = mutableListOf<Int>(); var inCount = 0
            val mn = monthNames(s.lang)[m]
            Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(20.dp, 4.dp, 20.dp, 40.dp)) {
                In(0) { StreakChip(streak, total) }
                Spacer(Modifier.height(18.dp))
                In(1) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        IconBtn(Icons.Rounded.ChevronLeft, color = if (canPrev) null else sub().copy(alpha = .3f)) { if (canPrev) my-- }
                        HText("$mn $y", 18f, FontWeight.ExtraBold, align = TextAlign.Center, modifier = Modifier.weight(1f))
                        IconBtn(Icons.Rounded.ChevronRight, color = if (canNext) null else sub().copy(alpha = .3f)) { if (canNext) my++ }
                    }
                }
                Spacer(Modifier.height(8.dp))
                Row { for (w in wd) HText(w, 12.5f, FontWeight.SemiBold, sub(), Modifier.weight(1f), align = TextAlign.Center) }
                Spacer(Modifier.height(6.dp))
                val cells = lead + n; val rows = (cells + 6) / 7
                for (r in 0 until rows) Row(Modifier.fillMaxWidth()) {
                    for (c in 0 until 7) {
                        val d = r * 7 + c - lead + 1
                        Box(Modifier.weight(1f).aspectRatio(1f).padding(3.dp), contentAlignment = Alignment.Center) {
                            if (d in 1..n) {
                                val k = y * 372 + m * 31 + d; val inn = iso(y, m, d) in days; val isToday = k == todayKey
                                val past = firstKey != null && k >= firstKey && k < todayKey; val miss = past && !inn
                                if (inn) inCount++; if (miss) missed.add(d)
                                val bg = if (inn) Brand else if (miss) Heart.copy(alpha = .16f) else Color.Transparent
                                val fg = if (inn) Cream else if (miss) Heart else if (k > todayKey || firstKey == null || k < firstKey) sub().copy(alpha = .5f) else ink()
                                Box(Modifier.fillMaxSize().background(bg, CircleShape).then(if (isToday) Modifier.border(2.dp, ink(), CircleShape) else Modifier), contentAlignment = Alignment.Center) {
                                    HText("$d", 14f, if (inn || isToday) FontWeight.ExtraBold else FontWeight.Medium, fg)
                                }
                            }
                        }
                    }
                }
                Spacer(Modifier.height(10.dp))
                @Composable fun legend(c: Color, t: String, ring: Boolean = false) = Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(14.dp).then(if (ring) Modifier.border(2.dp, c, CircleShape) else Modifier.background(c, CircleShape))); Spacer(Modifier.width(6.dp)); HText(t, 12.5f, color = sub())
                }
                androidx.compose.foundation.layout.FlowRow(horizontalArrangement = Arrangement.spacedBy(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) { legend(Brand, s.t("cal_in")); legend(Heart, s.t("cal_miss")); legend(ink(), s.t("cal_today"), true) }
                Spacer(Modifier.height(18.dp))
                HText(s.t("cal_month").replace("{a}", "$inCount").replace("{b}", "${missed.size}"), 15f, FontWeight.Bold)
                Spacer(Modifier.height(14.dp)); HText(s.t("cal_missed_list"), 13f, FontWeight.Bold, sub()); Spacer(Modifier.height(8.dp))
                if (missed.isEmpty()) HText(s.t("cal_none"), 14f, color = sub())
                else androidx.compose.foundation.layout.FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    for (d in missed) { val dow = (java.util.Calendar.getInstance().apply { clear(); set(y, m, d) }.get(java.util.Calendar.DAY_OF_WEEK) + 5) % 7
                        HText("${wd[dow]}, $d ${monthNames(s.lang)[m]}", 13f, FontWeight.SemiBold, Heart, Modifier.background(Heart.copy(alpha = .12f), RoundedCornerShape(16.dp)).padding(12.dp, 8.dp)) }
                }
                Spacer(Modifier.height(18.dp)); HText(s.t("cal_note"), 12.5f, color = sub(), lh = 17.5f)
            }
        }
    }
}

// ───────── foto layar penuh ─────────
@Composable fun ImageViewer(url: String, name: String) {
    var scale by remember { mutableFloatStateOf(1f) }; var off by remember { mutableStateOf(androidx.compose.ui.geometry.Offset.Zero) }
    Box(Modifier.fillMaxSize().background(Color.Black)) {
        Box(Modifier.fillMaxSize().pointerInput(Unit) { androidx.compose.foundation.gestures.detectTapGestures { Nav.back() } }
            .pointerInput(Unit) { detectTransformGestures { _, pan, z, _ -> scale = (scale * z).coerceIn(1f, 5f); off = if (scale == 1f) androidx.compose.ui.geometry.Offset.Zero else off + pan } }
            .graphicsLayer(scaleX = scale, scaleY = scale, translationX = off.x, translationY = off.y), contentAlignment = Alignment.Center) { Img(url, Modifier.fillMaxSize(), ContentScale.Fit) }
        Box(Modifier.align(Alignment.TopEnd).statusBarsPadding().padding(8.dp)) { IconBtn(Icons.Rounded.Close, color = Color.White) { Nav.back() } }
        HText(name, 16f, FontWeight.Bold, Color.White, Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(20.dp), align = TextAlign.Center)
    }
}

// ───────── baris audio (offline, hasil cari) ─────────
}

@Composable fun AudioRow(a: A, mine: Boolean = false, onDelete: (() -> Unit)? = null, showOwner: Boolean = false, scope: Any? = null) {
    val s = Store; val sc = rememberCoroutineScope(); @Suppress("UNUSED_EXPRESSION") s.rev
    val on = s.playing == a.id
    Tap(Modifier.fillMaxWidth(), .99f, onTap = { openPost(a) }) {
        Row(Modifier.padding(bottom = 10.dp).fillMaxWidth().background(soft(), RoundedCornerShape(26.dp)).padding(12.dp, 12.dp, 6.dp, 12.dp), verticalAlignment = Alignment.CenterVertically) {
            if (a.url.isEmpty()) Box(Modifier.size(46.dp).background(ink().copy(alpha = .1f), CircleShape), contentAlignment = Alignment.Center) { HIcon(HK.hups, size = 22.dp, color = ink()) }
            else {
                val bg by animateColorAsState(if (on) ink() else Brand, tween(250), label = "ar")
                Tap(onTap = { sc.launch { try { s.play(a, scope = scope) } catch (_: Exception) { toast(s.t("e_server"), true) } } }) {
                    Box(Modifier.size(46.dp).background(bg, CircleShape), contentAlignment = Alignment.Center) { Icon(if (on) Icons.Rounded.Pause else Icons.Rounded.PlayArrow, null, Modifier.size(26.dp), tint = if (on) bgOf() else Color.White) }
                }
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                val d = a.desc.trim()
                HText(if (d.isEmpty()) s.t("untitled") else d, 15f, FontWeight.Bold, if (d.isEmpty()) sub() else ink(), maxLines = 3, overflow = TextOverflow.Ellipsis)
                Spacer(Modifier.height(4.dp))
                if (a.created > 0) HText(s.`when`(a.created), 12.5f, color = sub(), modifier = Modifier.padding(bottom = 3.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (a.url.isNotEmpty()) HText(if (on) "${mmss(s.posMs / 1000)} / ${mmss(a.secs)}" else mmss(a.secs), 13f, FontWeight.Bold, if (on) ink() else sub())
                    Spacer(Modifier.width(10.dp)); Box(Modifier.weight(1f, false)) { AudChip(a.rand, a.to) }
                    if (showOwner) { Spacer(Modifier.width(10.dp)); HText(a.ownerName, 13f, color = sub(), maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, false)) }
                    Spacer(Modifier.width(6.dp))
                    Tap(onTap = { sc.launch { toggleOfflinePost(a) } }) { Icon(if (s.isOffline(a.id)) Icons.Rounded.OfflinePin else Icons.Outlined.DownloadForOffline, null, Modifier.padding(4.dp).size(20.dp), tint = if (s.isOffline(a.id)) ink() else sub()) }
                }
            }
            if (!mine && s.me != null && s.me!!.username != a.owner) Tap(onTap = { sc.launch { reportSheet(audio = a.id) } }) { Icon(Icons.Outlined.Flag, null, Modifier.padding(6.dp).size(19.dp), tint = sub()) }
            LikeBtn(a.liked, a.likes) { sc.launch { likeAudio(a) } }
            if (onDelete != null) IconBtn(Icons.Outlined.DeleteOutline, color = sub()) { onDelete() }
        }
    }
}

@Composable fun OfflinePage() {
    val s = Store; @Suppress("UNUSED_EXPRESSION") s.rev
    val owner = remember { Any() }; DisposableEffect(Unit) { onDispose { s.leave(owner) } }
    Column(Modifier.fillMaxSize()) {
        TopBar(back = true, title = s.t("offline_t"))
        if (s.offline.isEmpty()) Empty(Icons.Outlined.DownloadForOffline, s.t("empty_offline"))
        else LazyColumn(Modifier.weight(1f), contentPadding = PaddingValues(20.dp, 4.dp, 20.dp, 40.dp)) {
            itemsIndexed(s.offline.toList(), key = { _, a -> "o${a.id}" }) { i, a -> In(i) { AudioRow(a, showOwner = true, scope = owner) } }
        }
    }
}
