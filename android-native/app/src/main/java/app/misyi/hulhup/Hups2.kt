package app.misyi.hulhup

import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.Icon
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.text.ClickableText
import androidx.compose.foundation.text.selection.SelectionContainer
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONObject

val mentionRe = Regex("${linkRe.pattern}|@([a-z0-9_]{3,20})", RegexOption.IGNORE_CASE)

/** Teks dengan tautan dan @nama yang bisa diketuk (membuka profil akun itu). */
@Composable fun MentionText(text: String, style: TextStyle, maxLines: Int = Int.MAX_VALUE, selectable: Boolean = false) {
    val link = acc(); val sc = rememberCoroutineScope()
    val shownMap = remember(text) { mutableListOf<Triple<Int, Int, String>>() }
    val ann = remember(text, link) {
        shownMap.clear()
        buildAnnotatedString {
            var last = 0
            for (m in mentionRe.findAll(text)) {
                val raw = m.value; val isTag = m.groups[2] != null
                val shown = if (isTag) raw else trimLink(raw); if (shown.isEmpty()) continue
                if (m.range.first > last) append(text.substring(last, m.range.first))
                val st = length
                withStyle(SpanStyle(color = link, fontWeight = if (isTag) FontWeight.ExtraBold else FontWeight.SemiBold, textDecoration = if (isTag) null else TextDecoration.Underline)) { append(shown) }
                shownMap.add(Triple(st, length, if (isTag) "@" + m.groupValues[2] else shown))
                last = m.range.first + shown.length
            }
            if (last < text.length) append(text.substring(last))
        }
    }
    val st = style.copy(color = ink(), fontFamily = Outfit)
    val body: @Composable () -> Unit = {
        ClickableText(ann, style = st, maxLines = maxLines, overflow = if (maxLines == Int.MAX_VALUE) TextOverflow.Clip else TextOverflow.Ellipsis, onClick = { off ->
            shownMap.firstOrNull { off >= it.first && off < it.second }?.let { (_, _, v) -> if (v.startsWith("@")) go("/@${v.substring(1).lowercase()}") else sc.launch { openLink(v) } }
        })
    }
    if (selectable) SelectionContainer { body() } else body()
}

/** Saran akun saat mengetik @… di kolom teks. Memilih satu mengganti ketikan dengan @nama. */
@Composable fun MentionBar(text: String, setText: (String) -> Unit) {
    var users by remember { mutableStateOf<List<JSONObject>>(emptyList()) }
    val m = Regex("@([a-z0-9_]{1,20})$").find(text); val q = m?.groupValues?.get(1) ?: ""
    LaunchedEffect(q) {
        if (q.isEmpty()) { users = emptyList(); return@LaunchedEffect }
        delay(280)
        try { val j = Api.req("GET", "/search?q=${java.net.URLEncoder.encode(q, "UTF-8")}"); users = (j.optJSONArray("users") ?: org.json.JSONArray()).objects().take(6) } catch (_: Exception) {}
    }
    if (users.isEmpty()) return
    LazyRow(Modifier.height(46.dp)) {
        items(users) { u ->
            Box(Modifier.padding(end = 8.dp, bottom = 6.dp)) {
                Tap(scale = .96f, onTap = { val mm = Regex("@([a-z0-9_]{1,20})$").find(text) ?: return@Tap; setText("${text.substring(0, mm.range.first)}@${u.optString("username")} "); users = emptyList() }) {
                    Row(Modifier.background(soft(), RoundedCornerShape(22.dp)).padding(6.dp, 4.dp, 14.dp, 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Avatar(u.strN("avatar"), u.optString("name"), 28.dp); Spacer(Modifier.width(8.dp)); HText("@${u.optString("username")}", 13.5f, FontWeight.Bold)
                    }
                }
            }
        }
    }
}

@Composable fun OwnerRow(a: A, more: (() -> Unit)? = null) {
    val s = Store
    Row(verticalAlignment = Alignment.CenterVertically) {
        Tap(onTap = { go("/@${a.owner}") }) { Avatar(a.ownerAvatar, a.ownerName, 42.dp) }
        Spacer(Modifier.width(10.dp))
        Tap(Modifier.weight(1f), onTap = { go("/@${a.owner}") }) {
            Column {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    HText(a.ownerName, 15.5f, FontWeight.ExtraBold, maxLines = 1, modifier = Modifier.weight(1f, fill = false))
                    if (a.ownerVerified) Icon(Icons.Rounded.Verified, null, Modifier.padding(start = 4.dp).size(15.dp), tint = Blue)
                }
                HText("${a.owner} · ${s.`when`(a.created)}", 12.5f, color = sub(), maxLines = 1)
            }
        }
        if (more != null) IconBtn(Icons.Rounded.MoreHoriz, color = sub()) { more() }
    }
}

/** Aksi di bawah post: sorot, komentar, simpan, bagikan. */
@Composable fun PostActions(a: A, onComments: (() -> Unit)? = null) {
    val s = Store; val sc = rememberCoroutineScope(); s.rev
    Column {
        Row(verticalAlignment = Alignment.CenterVertically) {
            LikeBtn(a.liked, a.likes) { sc.launch { likeAudio(a) } }
            ActBtn(HK.comment, count = a.comments) { (onComments ?: { openPost(a) })() }
            Spacer(Modifier.weight(1f))
            ActBtn(HK.save, a.saved) { sc.launch { savePost(a) } }
            ActBtn(HK.share) { sc.launch { sharePost(a) } }
        }
        HText(if (a.files.isNotEmpty() && !a.bgm) "${s.fmt(a.views)} ${s.t("views")} · ${s.fmt(a.plays)} ${s.t("plays")}" else "${s.fmt(a.views)} ${s.t("views")}", 12.5f, FontWeight.Medium, sub(), Modifier.padding(8.dp, 0.dp, 8.dp, 6.dp))
    }
}

suspend fun likeAudio(a: A) {
    val s = Store
    if (s.me == null) { toast(s.t("need_login")); return }
    if (!s.needNet()) return
    try { s.like(a) } catch (e: Exception) { toast(s.err(e), true) }
}

suspend fun toggleOfflinePost(a: A) {
    val s = Store
    try { s.toggleOffline(a); toast(s.t(if (s.isOffline(a.id)) "offline_added" else "offline_removed")) } catch (e: Exception) { toast(s.err(e), true) }
}

suspend fun postMenu(a: A, onDeleted: (() -> Unit)? = null) {
    val s = Store; val mine = s.me?.username == a.owner
    val r = sheet<String> { done ->
        Column {
            PBtn(s.t("share"), { done("share") }, ghost = true, icon = Icons.Rounded.IosShare)
            Spacer(Modifier.height(10.dp))
            if (mine) PBtn(s.t("delete"), { done("delete") }, ghost = true, icon = Icons.Rounded.DeleteOutline, fgc = Heart)
            else if (s.me != null) PBtn(s.t("report"), { done("report") }, ghost = true, icon = Icons.Outlined.Flag)
        }
    }
    when (r) {
        "share" -> sharePost(a)
        "delete" -> {
            if (!confirm(s.t("delete"), s.t("delete_audio_q"), s.t("delete"), danger = true)) return
            try { Api.req("DELETE", "/audios/${a.id}"); onDeleted?.invoke() } catch (e: Exception) { toast(s.err(e), true) }
        }
        "report" -> reportSheet(audio = a.id)
    }
}

// ---------- kartu post (daftar Hups, profil) ----------
@Composable fun PostCard(a: A, scope: Any? = null, onDeleted: (() -> Unit)? = null, modifier: Modifier = Modifier) {
    val s = Store; val sc = rememberCoroutineScope()
    LaunchedEffect(a.id) { s.countView(a) }
    val text = (a.text ?: a.desc).trim()
    val tm = rememberTextMeasurer()
    val st = TextStyle(fontSize = 15.5.sp, lineHeight = (15.5 * 1.45).sp, fontFamily = Outfit)
    Tap(modifier, .99f, onTap = { openPost(a) }) {
        Column(Modifier.padding(bottom = 12.dp).shadow(6.dp, RoundedCornerShape(28.dp), ambientColor = Color.Black.copy(.05f), spotColor = Color.Black.copy(.05f))
            .background(cardC(), RoundedCornerShape(28.dp)).border(1.dp, ink().copy(alpha = .07f), RoundedCornerShape(28.dp)).padding(16.dp, 14.dp, 8.dp, 4.dp)) {
            OwnerRow(a, more = { sc.launch { postMenu(a, onDeleted) } })
            Box(Modifier.padding(top = 8.dp, end = 8.dp)) { AudChip(a.rand, a.to) }
            if (text.isNotEmpty()) BoxWithConstraints(Modifier.padding(0.dp, 10.dp, 8.dp, 0.dp)) {
                val w = constraints.maxWidth
                val over = a.long || tm.measure(AnnotatedString(text), st, maxLines = 6, constraints = androidx.compose.ui.unit.Constraints(maxWidth = w)).hasVisualOverflow
                Column {
                    MentionText(text, st, maxLines = 6)
                    if (over) HText(s.t("read_more"), 14f, FontWeight.Bold, acc(), Modifier.padding(top = 4.dp))
                }
            }
            firstUrl(text)?.let { LinkEmbed(it) }
            if (a.files.isNotEmpty()) Box(Modifier.padding(end = 8.dp)) { if (a.bgm) BgmBar(a) else AudioBars(a, scope) }
            Spacer(Modifier.height(4.dp))
            PostActions(a)
        }
    }
}

// ---------- umpan Hups ----------
@OptIn(ExperimentalMaterial3Api::class)
@Composable fun HupsFeed(filter: String) {
    val s = Store; val sc = rememberCoroutineScope()
    val items = remember { mutableStateListOf<A>() }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var next by remember { mutableIntStateOf(0) }
    var refreshing by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var more by remember { mutableStateOf(false) }
    val owner = remember { Any() }
    val ls = rememberLazyListState()
    val top = Nav.stack.lastOrNull()
    val screen = remember { top }

    suspend fun load() {
        try {
            val j = Api.req("GET", "/hups?f=$filter")
            items.clear(); items.addAll((j.optJSONArray("items") ?: org.json.JSONArray()).objects().map { A(it) }); next = j.optInt("next"); error = null
        } catch (e: Exception) { error = s.err(e) }
        loading = false
    }
    LaunchedEffect(filter) { load() }
    // Real-time: segarkan diam-diam; di paling atas diganti utuh, di bawahnya hanya angka sorot/komentar yang diperbarui.
    LaunchedEffect(filter) {
        while (true) {
            delay(6000)
            if (Nav.stack.lastOrNull() !== screen || loading || busy || more) continue
            busy = true
            try {
                val j = Api.req("GET", "/hups?f=$filter")
                val fresh = (j.optJSONArray("items") ?: org.json.JSONArray()).objects().map { A(it) }
                if (ls.firstVisibleItemIndex == 0 && ls.firstVisibleItemScrollOffset < 60) { items.clear(); items.addAll(fresh); next = j.optInt("next") }
                else for (f in fresh) for (o in items) if (o.id == f.id) { o.likes = f.likes; o.comments = f.comments; o.liked = f.liked; o.saved = f.saved }
                s.poke()
            } catch (_: Exception) {}
            busy = false
        }
    }
    // Post yang paling dekat tengah layar menjadi "fokus": bila itu backsound, otomatis diputar; bila bukan, dihentikan.
    LaunchedEffect(filter) {
        while (true) {
            delay(600)
            if (Nav.stack.lastOrNull() !== screen || items.isEmpty()) continue
            val li = ls.layoutInfo; val h = li.viewportEndOffset; val mid = h / 2
            val vis = li.visibleItemsInfo.filter { it.offset < h - 40 && it.offset + it.size > 40 }
            val best = vis.minByOrNull { Math.abs(it.offset + it.size / 2 - mid) }?.let { items.getOrNull(it.index) }
            if (best != null && best.bgm && best.files.isNotEmpty()) s.playBgm(best.id, bgmUrl(best), scope = owner)
            else if (s.bgmKey != null) s.leaveBgm(owner)
        }
    }
    DisposableEffect(Unit) { onDispose { s.leave(owner); s.leaveBgm(owner) } }
    LaunchedEffect(ls) {
        snapshotFlow { ls.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0 }.collect { last ->
            if (!more && next != 0 && !loading && items.isNotEmpty() && last >= items.size - 3) {
                more = true
                try {
                    val j = Api.req("GET", "/hups?f=$filter&next=$next")
                    val have = items.map { it.id }.toSet()
                    items.addAll((j.optJSONArray("items") ?: org.json.JSONArray()).objects().map { A(it) }.filter { it.id !in have }); next = j.optInt("next")
                } catch (_: Exception) {}
                more = false
            }
        }
    }

    if (loading) { Loader(); return }
    if (error != null) { Empty(Icons.Rounded.CloudOff, error!!, action = { PBtn(s.t("retry"), { loading = true; sc.launch { load() } }, modifier = Modifier.width(160.dp)) }); return }
    val pst = androidx.compose.material3.pulltorefresh.rememberPullToRefreshState()
    PullToRefreshBox(isRefreshing = refreshing, onRefresh = { sc.launch { refreshing = true; load(); refreshing = false } }, state = pst, indicator = {
        androidx.compose.material3.pulltorefresh.PullToRefreshDefaults.Indicator(modifier = Modifier.align(Alignment.TopCenter), state = pst, isRefreshing = refreshing, containerColor = Color.Transparent, color = Color.Transparent)
        if (refreshing || pst.distanceFraction > .3f) Box(Modifier.align(Alignment.TopCenter).padding(top = 10.dp)) { LogoLoop(34.dp) }
    }) {
        if (items.isEmpty()) LazyColumn(Modifier.fillMaxSize()) { item { Spacer(Modifier.height(80.dp)); Empty(Icons.Outlined.Forum, s.t("no_hups"), custom = { HIcon(HK.hups, size = 32.dp, color = sub()) }) } }
        else LazyColumn(Modifier.fillMaxSize(), state = ls, contentPadding = PaddingValues(16.dp, 6.dp, 16.dp, 110.dp)) {
            itemsIndexed(items, key = { _, a -> a.id }) { i, a ->
                In(if (i < 8) i else 0) { PostCard(a, scope = owner, onDeleted = { items.removeAll { it.id == a.id }; s.poke() }) }
            }
        }
    }
}
