package app.misyi.hulhup

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

// ---------- halaman post ----------
@Composable fun PostPage(id: Int, seed: A? = null, comment: Int? = null) {
    val s = Store; val sc = rememberCoroutineScope(); val owner = remember { Any() }
    var a by remember { mutableStateOf(seed) }
    var text by remember { mutableStateOf(seed?.text ?: seed?.desc ?: "") }
    val cmts = remember { mutableStateListOf<JSONObject>() }
    var tick by remember { mutableIntStateOf(0) }
    var loading by remember { mutableStateOf(true) }
    var sending by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var input by remember { mutableStateOf(TextFieldValue("")) }
    var replyTo by remember { mutableStateOf<JSONObject?>(null) }
    var autoTag by remember { mutableStateOf("") }
    var hl by remember { mutableStateOf(comment) }
    val focus = remember { FocusRequester() }
    val ls = rememberLazyListState()
    val me = remember { Nav.stack.lastOrNull() }

    suspend fun loadComments() { val j = Api.req("GET", "/posts/$id/comments"); cmts.clear(); cmts.addAll((j.optJSONArray("items") ?: JSONArray()).objects()) }
    suspend fun reloadPost() { val p = Api.req("GET", "/posts/$id"); a = A(p.getJSONObject("post")) }
    suspend fun load() {
        try {
            val j = Api.req("GET", "/posts/$id")
            a = A(j.getJSONObject("post")); text = j.strN("text") ?: ""; s.countView(a!!)
            loadComments(); error = null
            a?.let { p -> if (p.bgm && p.files.isNotEmpty()) s.playBgm(p.id, bgmUrl(p), scope = owner) }
        } catch (e: Exception) { error = if (e is ApiErr && e.code == "not_found") s.t("post_gone") else s.err(e) }
        loading = false
    }
    LaunchedEffect(id) { seed?.let { s.countView(it) }; load() }
    // Real-time: komentar dan angka baru muncul sendiri tanpa memuat ulang halaman.
    LaunchedEffect(id) {
        while (true) {
            delay(5000)
            if (loading || sending || Nav.stack.lastOrNull() !== me) continue
            try {
                val p = Api.req("GET", "/posts/$id"); val cm = Api.req("GET", "/posts/$id/comments")
                if (sending) continue
                a = A(p.getJSONObject("post")); text = p.strN("text") ?: text
                cmts.clear(); cmts.addAll((cm.optJSONArray("items") ?: JSONArray()).objects())
            } catch (_: Exception) {}
        }
    }
    DisposableEffect(Unit) { onDispose { s.leave(owner); s.leaveBgm(owner) } }
    LaunchedEffect(hl, cmts.size) { if (hl != null && cmts.isNotEmpty()) { delay(350); delay(3000); hl = null } }

    suspend fun send() {
        val t = input.text.trim(); if (t.isEmpty()) return
        if (t == autoTag.trim()) return
        sending = true
        var cid: Int? = null
        try {
            val j = Api.req("POST", "/posts/$id/comments", JSONObject().put("text", t).put("parent", replyTo?.optInt("id") ?: JSONObject.NULL))
            cid = j.optInt("id"); input = TextFieldValue(""); replyTo = null; autoTag = ""
            loadComments(); reloadPost()
        } catch (e: Exception) {
            if (cid != null) { try { Api.req("DELETE", "/comments/$cid") } catch (_: Exception) {} }
            toast(s.err(e), true)
        }
        sending = false
    }
    /** Balas: komentar yang dibalas otomatis di-tag di awal tulisan. */
    fun reply(c: JSONObject) {
        val tag = "@${c.optString("username")} "; val cur = input.text
        val body = if (cur.startsWith(autoTag)) cur.substring(autoTag.length) else cur
        autoTag = tag; input = TextFieldValue("$tag$body", TextRange(tag.length + body.length)); replyTo = c
        try { focus.requestFocus() } catch (_: Exception) {}
    }
    suspend fun delCmt(c: JSONObject) {
        if (!confirm(s.t("delete"), s.t("delete_cmt_q"), s.t("delete"), danger = true)) return
        try {
            Api.req("DELETE", "/comments/${c.optInt("id")}"); cmts.removeAll { it.optInt("id") == c.optInt("id") }
            loadComments(); reloadPost()
            if (replyTo != null && cmts.none { it.optInt("id") == replyTo!!.optInt("id") }) replyTo = null
        } catch (e: Exception) { toast(s.err(e), true) }
    }
    suspend fun pinCmt(c: JSONObject) {
        try {
            val j = Api.req("POST", "/comments/${c.optInt("id")}/pin")
            cmts.forEach { it.put("pinned", false) }; c.put("pinned", j.optBoolean("pinned")); tick++
            toast(s.t(if (c.optBoolean("pinned")) "pinned" else "unpin"))
        } catch (e: Exception) { toast(s.err(e), true) }
    }
    suspend fun likeCmt(c: JSONObject) {
        if (s.me == null) { toast(s.t("need_login")); return }
        try { val j = Api.req("POST", "/comments/${c.optInt("id")}/like"); c.put("liked", j.opt("liked")); c.put("likes", j.opt("likes")); tick++ } catch (e: Exception) { toast(s.err(e), true) }
    }

    /** Urutan tampilan: komentar utama (yang disematkan di atas), lalu semua balasannya. Menjorok maksimal 3 tingkat. */
    fun flat(): List<Pair<JSONObject, Int>> {
        val kids = HashMap<Int, MutableList<JSONObject>>(); val ids = cmts.map { it.optInt("id") }.toSet()
        for (c in cmts) { var p = c.optInt("parent"); if (p != 0 && p !in ids) p = 0; kids.getOrPut(p) { mutableListOf() }.add(c) }
        val top = (kids[0] ?: mutableListOf()).sortedByDescending { if (it.optBoolean("pinned")) 1 else 0 }
        val out = mutableListOf<Pair<JSONObject, Int>>()
        fun walk(c: JSONObject, d: Int) { out.add(c to d); kids[c.optInt("id")]?.forEach { walk(it, d + 1) } }
        top.forEach { walk(it, 0) }
        return out
    }

    val p = a
    Column(Modifier.fillMaxSize()) {
        TopBar(back = true, title = s.t("hups"), actions = { if (p != null) IconBtn(Icons.Rounded.MoreHoriz) { sc.launch { postMenu(p) { Nav.back() } } } })
        Box(Modifier.weight(1f)) {
            if (loading && p == null) Loader("postpage")
            else if (error != null && p == null) Empty(Icons.Outlined.Lock, error!!)
            else if (p != null) {
                tick; s.rev
                LazyColumn(Modifier.fillMaxSize(), state = ls, contentPadding = PaddingValues(18.dp, 4.dp, 18.dp, 24.dp)) {
                    item {
                        Column {
                            OwnerRow(p)
                            if (text.isNotEmpty()) Box(Modifier.padding(top = 14.dp)) { MentionText(text, TextStyle(fontSize = 17.sp, lineHeight = (17 * 1.55).sp), selectable = true, hideQuote = true) }
                            val qr = quoteRef(text)
                            if (qr != null) QuoteCard(qr.id)
                            MediaStrip(postMedia(text, p.media))
                            if (p.files.isNotEmpty()) Box(Modifier.padding(top = 6.dp)) { if (p.bgm) BgmBar(p) else AudioBars(p, owner) }
                            Spacer(Modifier.height(10.dp))
                            PostActions(p) { try { focus.requestFocus() } catch (_: Exception) {} }
                            Box(Modifier.padding(vertical = 12.dp).fillMaxWidth().height(1.dp).background(ink().copy(alpha = .08f)))
                            HText("${s.t("comments")} (${p.comments})", 16f, FontWeight.ExtraBold)
                            Spacer(Modifier.height(10.dp))
                            if (cmts.isEmpty()) Box(Modifier.fillMaxWidth().padding(vertical = 24.dp), contentAlignment = Alignment.Center) { HText(s.t("empty_cmt"), 15f, color = sub(), align = TextAlign.Center) }
                        }
                    }
                    itemsIndexed(flat(), key = { _, e -> e.first.optInt("id") }) { _, e ->
                        val c = e.first
                        Box(Modifier.background(if (hl == c.optInt("id")) acc().copy(alpha = .12f) else Color.Transparent, RoundedCornerShape(16.dp))) {
                            CommentTile(c, minOf(e.second, 3), p.id, p.owner, owner, onReply = { reply(c) }, onLike = { sc.launch { likeCmt(c) } }, onDelete = { sc.launch { delCmt(c) } }, onPin = { sc.launch { pinCmt(c) } })
                        }
                    }
                }
                LaunchedEffect(hl, cmts.size) { val h = hl; if (h != null) { val i = flat().indexOfFirst { it.first.optInt("id") == h }; if (i >= 0) ls.animateScrollToItem(i + 1) } }
            }
        }
        // penulis komentar
        if (s.me == null) Box(Modifier.padding(16.dp, 8.dp, 16.dp, 14.dp).navigationBarsPadding()) { PBtn(s.t("login_comment"), { go("/login") }, icon = Icons.Rounded.Login) }
        else Column(Modifier.fillMaxWidth().background(cardC()).imePadding().navigationBarsPadding().padding(12.dp, 8.dp, 12.dp, 10.dp)) {
            MentionBar(input.text) { input = TextFieldValue(it, TextRange(it.length)) }
            if (replyTo != null) Row(Modifier.padding(bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                HText(s.t("replying").replace("{n}", replyTo!!.optString("name")), 13f, FontWeight.Bold, acc(), Modifier.weight(1f))
                Tap(onTap = { val cur = input.text; if (cur.startsWith(autoTag)) input = TextFieldValue(cur.substring(autoTag.length)); autoTag = ""; replyTo = null }) { Icon(Icons.Rounded.Close, null, Modifier.padding(11.dp).size(26.dp), tint = sub()) }
            }
            Row(verticalAlignment = Alignment.Bottom) {
                Box(Modifier.weight(1f).background(soft(), RoundedCornerShape(24.dp)).padding(horizontal = 16.dp, vertical = 12.dp)) {
                    if (input.text.isEmpty()) HText(s.t("comment_ph"), 15.5f, color = sub())
                    BasicTextField(input, { input = it }, Modifier.fillMaxWidth().focusRequester(focus), textStyle = TextStyle(fontSize = 15.5.sp, color = ink(), fontFamily = Outfit), cursorBrush = SolidColor(ink()), minLines = 1, maxLines = 5, keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences))
                }
                Spacer(Modifier.width(8.dp))
                Tap(onTap = if (sending) null else ({ sc.launch { send() } })) {
                    Box(Modifier.size(46.dp).background(btnBg(), CircleShape), contentAlignment = Alignment.Center) {
                        if (sending) CircularProgressIndicator(Modifier.size(20.dp), color = Cream, strokeWidth = 2.2.dp) else Icon(Icons.Rounded.ArrowUpward, null, Modifier.size(22.dp), tint = Cream)
                    }
                }
            }
        }
    }
}

@Composable fun CommentTile(c: JSONObject, depth: Int, postId: Int, postOwner: String, scope: Any?, onReply: () -> Unit, onLike: () -> Unit, onDelete: () -> Unit, onPin: () -> Unit) {
    val s = Store; val sc = rememberCoroutineScope()
    var full by remember(c.optInt("id")) { mutableStateOf<String?>(null) }
    var loadingFull by remember { mutableStateOf(false) }
    val liked = c.optBoolean("liked"); val isAuthor = c.optString("username") == postOwner
    val audios = (c.optJSONArray("audios") ?: JSONArray()).objects()
    val shown = full ?: c.optString("text")
    suspend fun menu() {
        val iAmOwner = s.me?.username == postOwner
        val r = sheet<String> { done ->
            Column {
                PBtn(s.t("share"), { done("share") }, ghost = true, icon = Icons.Rounded.IosShare); Spacer(Modifier.height(10.dp))
                if (iAmOwner && c.optInt("parent") == 0) { PBtn(s.t(if (c.optBoolean("pinned")) "unpin" else "pin"), { done("pin") }, ghost = true, icon = Icons.Outlined.PushPin); Spacer(Modifier.height(10.dp)) }
                if (c.optBoolean("mine") || iAmOwner) PBtn(s.t("delete"), { done("delete") }, ghost = true, icon = Icons.Rounded.DeleteOutline, fgc = Heart)
                if (!c.optBoolean("mine") && s.me != null) { if (iAmOwner) Spacer(Modifier.height(10.dp)); PBtn(s.t("report_cmt"), { done("report") }, ghost = true, icon = Icons.Outlined.Flag) }
            }
        }
        when (r) { "share" -> shareUrl(commentLink(postId, c.optInt("id"))); "pin" -> onPin(); "delete" -> onDelete(); "report" -> reportSheet(comment = c.optInt("id")) }
    }
    Row(Modifier.padding(start = (depth * 16).dp, bottom = 14.dp)) {
        if (depth > 0) Box(Modifier.padding(end = 10.dp, top = 4.dp).width(2.dp).height(34.dp).background(ink().copy(alpha = .12f), RoundedCornerShape(1.dp)))
        Tap(onTap = { go("/@${c.optString("username")}") }) { Avatar(c.strN("avatar"), c.optString("name"), 34.dp) }
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                HText(c.optString("name"), 14.5f, FontWeight.ExtraBold, maxLines = 1, modifier = Modifier.weight(1f, fill = false))
                if (c.optBoolean("verified")) Icon(Icons.Rounded.Verified, null, Modifier.padding(start = 3.dp).size(14.dp), tint = Blue)
                if (isAuthor) Box(Modifier.padding(start = 6.dp).background(ink(), RoundedCornerShape(8.dp)).padding(horizontal = 7.dp, vertical = 2.dp)) { HText(s.t("author"), 10.5f, FontWeight.ExtraBold, bgOf()) }
                Spacer(Modifier.width(8.dp))
                HText(s.`when`(c.optLong("created")), 12f, color = sub(), maxLines = 1, modifier = Modifier.weight(1f, fill = false))
            }
            if (c.optBoolean("pinned")) Row(Modifier.padding(top = 2.dp), verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Rounded.PushPin, null, Modifier.size(12.dp), tint = sub()); Spacer(Modifier.width(4.dp)); HText(s.t("pinned"), 11.5f, FontWeight.Bold, sub()) }
            if (shown.isNotEmpty()) Box(Modifier.padding(top = 3.dp)) { MentionText(shown, TextStyle(fontSize = 15.sp, lineHeight = (15 * 1.45).sp), selectable = true) }
            if (c.optBoolean("long") && full == null) Tap(onTap = if (loadingFull) null else ({ sc.launch { loadingFull = true; try { full = Api.req("GET", "/comments/${c.optInt("id")}/text").optString("text") } catch (e: Exception) { toast(s.err(e), true) }; loadingFull = false } })) {
                HText(if (loadingFull) "…" else s.t("read_more"), 13.5f, FontWeight.Bold, acc(), Modifier.padding(top = 4.dp))
            }
            audios.forEachIndexed { i, x -> FileBar(-(1000000000 + c.optInt("id") * 4 + i), x.optString("url"), x.optInt("secs"), scope) }
            Row(verticalAlignment = Alignment.CenterVertically) {
                ActBtn(HK.sorot, liked, c.optInt("likes")) { onLike() }
                Tap(onTap = if (s.me == null) ({ toast(s.t("need_login")) }) else onReply) { HText(s.t("reply"), 13f, FontWeight.Bold, sub(), Modifier.padding(8.dp)) }
                Spacer(Modifier.weight(1f))
                Tap(onTap = { sc.launch { menu() } }) { Icon(Icons.Rounded.MoreHoriz, null, Modifier.padding(8.dp).size(20.dp), tint = sub()) }
            }
        }
    }
}

// ---------- tulis post ----------
@Composable fun ComposePage() {
    val s = Store; val sc = rememberCoroutineScope()
    var text by remember { mutableStateOf("") }
    var clip by remember { mutableStateOf<AudioClip?>(null) }
    var playing by remember { mutableStateOf(false) }
    var pprof by remember { mutableStateOf(true) }
    var busy by remember { mutableStateOf(false) }
    var bgm by remember { mutableStateOf(false) }
    var rand by remember { mutableStateOf("public") }
    var picked by remember { mutableStateOf<Map<String, JSONObject>>(emptyMap()) }
    val media = remember { mutableStateListOf<String>() }
    DisposableEffect(Unit) { onDispose { Store.stop() } }

    suspend fun add() { val c = sheet<AudioClip> { done -> RecordSheet { done(it) } } ?: return; Store.stop(); clip = c; playing = false }
    suspend fun play() {
        val c = clip ?: return
        if (playing) { Store.stop(); playing = false; return }
        playing = true
        try { Store.playBytes(-777, c.bytes, loop = false) { playing = false } } catch (_: Exception) { playing = false }
    }
    suspend fun pickAcc() {
        val r = sheet<Map<String, JSONObject>> { done -> AccountPickSheet(picked) { done(it) } } ?: return
        picked = r
        if (r.isEmpty()) { val l = audSplit(rand).toMutableList().also { it.remove("accounts") }; rand = if (l.isEmpty()) "public" else l.joinToString(",") }
    }
    suspend fun send() {
        val t = text.trim(); val c = clip
        if (c == null && t.isEmpty() && media.isEmpty()) { toast(s.t("e_empty"), true); return }
        if (audSplit(rand).contains("accounts") && picked.isEmpty()) { toast(s.t("e_need_accounts"), true); return }
        busy = true
        var id: Int? = null
        try {
            val b = JSONObject().put("text", t).put("audios", if (c == null) 0 else 1).put("pprof", pprof).put("rand", JSONArray(audSplit(rand))).put("to", JSONArray(picked.keys.toList()))
            if (c != null) b.put("bgm", bgm)
            if (media.isNotEmpty()) b.put("media", JSONArray(media.toList()))
            val j = Api.req("POST", "/posts", b); id = j.optInt("id")
            if (c != null) Api.multi("/posts/$id/audio", c.bytes, mapOf("secs" to "${c.secs}"))
            Nav.back(); toast(s.t("posted"))
        } catch (e: Exception) {
            if (id != null) { try { Api.req("DELETE", "/audios/$id") } catch (_: Exception) {} }
            toast(s.err(e), true); busy = false
        }
    }
    @Composable fun Row2(label: String, v: Boolean, on: ((Boolean) -> Unit)?, note: String? = null) {
        Row(Modifier.padding(bottom = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) { HText(label, 16f, FontWeight.SemiBold); if (note != null) HText(note, 12.5f, color = sub()) }
            Box(Modifier.alpha2(if (on == null) .4f else 1f)) { Toggle(v) { on?.invoke(it) } }
        }
    }
    val hasAcc = audSplit(rand).contains("accounts")
    Column(Modifier.fillMaxSize().imePadding()) {
        TopBar(back = true, title = s.t("new_post"))
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(22.dp, 4.dp, 22.dp, 40.dp)) {
            AudioSlot(clip, playing, { sc.launch { play() } }, if (busy) null else ({ sc.launch { add() } })) { Store.stop(); clip = null; playing = false; bgm = false }
            if (clip != null) Box(Modifier.padding(top = 14.dp)) { Row2(s.t("bgm_label"), bgm, { bgm = it }, s.t("bgm_note")) }
            Spacer(Modifier.height(14.dp))
            Box(Modifier.fillMaxWidth().background(soft(), RoundedCornerShape(22.dp)).padding(18.dp, 14.dp)) {
                if (text.isEmpty()) HText(s.t("write_hups"), 16.5f, color = sub())
                BasicTextField(text, { text = it }, Modifier.fillMaxWidth(), textStyle = TextStyle(fontSize = 16.5.sp, lineHeight = (16.5 * 1.5).sp, color = ink(), fontFamily = Outfit), cursorBrush = SolidColor(ink()), minLines = 4, maxLines = 12, keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences))
            }
            Spacer(Modifier.height(6.dp))
            MentionBar(text) { text = it }
            HText(s.t("tag_hint"), 12.5f, color = sub(), modifier = Modifier.padding(start = 6.dp, bottom = 14.dp))
            MediaEditor(media, !busy)
            Row(Modifier.padding(bottom = 16.dp).fillMaxWidth().background(soft(), RoundedCornerShape(18.dp)).padding(14.dp, 12.dp), verticalAlignment = Alignment.Top) {
                Icon(Icons.Outlined.Info, null, Modifier.padding(top = 1.dp).size(18.dp), tint = sub()); Spacer(Modifier.width(10.dp))
                HText(s.t("media_hint"), 13f, color = sub(), lh = 19f)
            }
            Row2(s.t("pprof"), pprof, { pprof = it })
            Spacer(Modifier.height(2.dp))
            Pick(s.t("who_see"), rand, withLabels(uploadAud)) { v -> rand = v; if (audSplit(v).contains("accounts") && picked.isEmpty()) sc.launch { pickAcc() } }
            if (hasAcc) Box(Modifier.padding(top = 10.dp)) {
                Tap(scale = .98f, onTap = { sc.launch { pickAcc() } }) {
                    Row(Modifier.fillMaxWidth().background(soft(), RoundedCornerShape(24.dp)).padding(18.dp, 14.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Outlined.PersonSearch, null, Modifier.size(20.dp), tint = ink()); Spacer(Modifier.width(12.dp))
                        HText(s.t("pick_acc_n").replace("{n}", "${picked.size}"), 15f, FontWeight.SemiBold, modifier = Modifier.weight(1f)); Icon(Icons.Outlined.Edit, null, Modifier.size(18.dp), tint = sub())
                    }
                }
            }
            Spacer(Modifier.height(26.dp))
            PBtn(s.t("upload"), { sc.launch { send() } }, loading = busy, icon = Icons.Rounded.ArrowUpward)
            Spacer(Modifier.height(12.dp))
            HText(s.t("noedit"), 13f, color = sub(), align = TextAlign.Center, modifier = Modifier.fillMaxWidth())
        }
    }
}
private fun Modifier.alpha2(a: Float) = this.then(Modifier.alpha(a))
