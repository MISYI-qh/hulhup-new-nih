package app.misyi.hulhup

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.Icon
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

/** Logo Phipop apa adanya (tidak diwarnai ulang). */
@Composable fun PhipopLogo(size: androidx.compose.ui.unit.Dp) {
    Image(painterResource(R.drawable.phipop_logo), null, Modifier.size(size).clip(CircleShape))
}

/** Tombol logo di bilah atas Beranda. */
@Composable fun PhipopBtn() {
    Tap(onTap = { if (Store.me == null) go("/login") else go("/phipop") }) { Box(Modifier.size(44.dp), contentAlignment = Alignment.Center) { PhipopLogo(28.dp) } }
}

private fun JSONObject.lng(k: String): Long? = if (isNull(k) || !has(k)) null else optLong(k)

private fun leftTime(resetAt: Long): String {
    val ms = resetAt - System.currentTimeMillis(); if (ms <= 0) return "0m"
    val m = (ms / 60000).toInt(); val h = m / 60
    return if (h > 0) "${h}j ${m % 60}m" else if (m > 0) "${m}m" else "<1m"
}

@Composable private fun PField(v: String, on: (String) -> Unit, ph: String, modifier: Modifier = Modifier, min: Int = 1, max: Int = 1, caps: KeyboardCapitalization = KeyboardCapitalization.Sentences, enabled: Boolean = true) {
    Box(modifier.fillMaxWidth().background(soft(), RoundedCornerShape(20.dp)).padding(16.dp, 13.dp)) {
        if (v.isEmpty()) HText(ph, 15.5f, color = sub())
        BasicTextField(v, { if (enabled) on(it) }, Modifier.fillMaxWidth(), textStyle = TextStyle(fontSize = 15.5.sp, lineHeight = 22.sp, color = ink(), fontFamily = Outfit), cursorBrush = SolidColor(ink()), minLines = min, maxLines = max, singleLine = max == 1,
            keyboardOptions = KeyboardOptions(capitalization = caps))
    }
}

private fun fmtCode(s: String): String = s.uppercase().filter { it.isLetterOrDigit() }.take(12).chunked(4).joinToString("-")

// ───────── halaman Phipop ─────────
@Composable fun PhipopPage(code: String?) {
    val s = Store; val sc = rememberCoroutineScope()
    var st by remember { mutableStateOf<JSONObject?>(null) }
    var err by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        if (s.me == null) { Nav.replace(Screen("/login") { AuthPage() }); return@LaunchedEffect }
        try { st = Api.req("GET", "/phipop/status") } catch (e: Exception) { err = true; toast(s.err(e), true) }
    }
    val cur = st
    Column(Modifier.fillMaxSize().imePadding()) {
        val access = cur?.optBoolean("has_access") == true
        val msgs = remember { mutableStateListOf<JSONObject>() }
        TopBar(back = true, center = { Row(verticalAlignment = Alignment.CenterVertically) { PhipopLogo(26.dp); Spacer(Modifier.width(8.dp)); HText("Phipop", 18f, FontWeight.ExtraBold) } }, nActions = 2, actions = {
            if (access) {
                if (cur?.optBoolean("admin") == true) Tap(onTap = { go("/phipop/admin") }) { Box(Modifier.height(48.dp).padding(horizontal = 6.dp), contentAlignment = Alignment.Center) { Box(Modifier.clip(RoundedCornerShape(50)).background(soft()).padding(10.dp, 5.dp)) { HText(s.t("phipop_manage"), 12.5f, FontWeight.Bold) } } }
                IconBtn(Icons.Rounded.MoreVert) { sc.launch {
                    if (!confirm(s.t("phipop_clear"), s.t("phipop_clear_b"), s.t("phipop_clear"), true)) return@launch
                    try { Api.req("DELETE", "/phipop/chat"); msgs.clear() } catch (e: Exception) { toast(s.err(e), true) }
                } }
            }
        })
        when {
            cur == null -> Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) { if (!err) androidx.compose.material3.CircularProgressIndicator(Modifier.size(28.dp), color = ink(), strokeWidth = 2.5.dp) else HText(s.t("e_network"), 14f, color = sub()) }
            access -> PhipopChat(cur, msgs, { st = it })
            else -> PhipopLocked(cur, code, { st = it })
        }
    }
}

@Composable private fun ColumnScope.PhipopLocked(cur: JSONObject, code0: String?, setSt: (JSONObject) -> Unit) {
    val s = Store; val sc = rememberCoroutineScope()
    var why by remember { mutableStateOf("") }; var code by remember { mutableStateOf(fmtCode(code0 ?: "")) }
    var req by remember { mutableStateOf(cur.optBoolean("requested")) }
    var b1 by remember { mutableStateOf(false) }; var b2 by remember { mutableStateOf(false) }
    Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(22.dp, 6.dp, 22.dp, 40.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) { PhipopLogo(64.dp); Spacer(Modifier.width(14.dp)); HText("Phipop", 28f, FontWeight.ExtraBold) }
        HText(s.t("phipop_about"), 15.5f, color = sub(), modifier = Modifier.padding(top = 14.dp), lh = 22f)
        Column(Modifier.padding(top = 18.dp).fillMaxWidth().background(soft(), RoundedCornerShape(22.dp)).padding(18.dp, 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            listOf("phipop_s1" to true, "phipop_s2" to req, "phipop_s3" to false).forEachIndexed { i, (k, ok) ->
                Row(verticalAlignment = Alignment.Top) {
                    Box(Modifier.size(24.dp).background(if (ok) Brand else ink().copy(alpha = .12f), CircleShape), contentAlignment = Alignment.Center) {
                        if (ok) Icon(Icons.Rounded.Check, null, Modifier.size(15.dp), tint = Color.White) else HText("${i + 1}", 12f, FontWeight.ExtraBold, sub())
                    }
                    Spacer(Modifier.width(12.dp)); HText(s.t(k), 14.5f, modifier = Modifier.weight(1f), lh = 20f)
                }
            }
        }
        Spacer(Modifier.height(22.dp))
        if (req) {
            Row(Modifier.fillMaxWidth().background(soft(), RoundedCornerShape(18.dp)).padding(16.dp, 14.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Rounded.Check, null, Modifier.size(20.dp), tint = Brand); Spacer(Modifier.width(10.dp)); HText(s.t("phipop_req_sent"), 14.5f, FontWeight.SemiBold, modifier = Modifier.weight(1f))
            }
        } else {
            PField(why, { why = it.take(500) }, s.t("phipop_why_ph"), min = 3, max = 6)
            Spacer(Modifier.height(12.dp))
            PBtn(s.t("phipop_send_req"), if (why.isBlank()) null else ({
                sc.launch {
                    b1 = true
                    try { Api.req("POST", "/phipop/request", JSONObject().put("why", why.trim())); req = true }
                    catch (e: ApiErr) { if (e.code == "phipop_requested") req = true; if (e.code == "phipop_has") { try { setSt(Api.req("GET", "/phipop/status")) } catch (_: Exception) {} }; toast(s.err(e), true) }
                    catch (e: Exception) { toast(s.err(e), true) }
                    b1 = false
                }
            }), loading = b1)
        }
        HText(s.t("phipop_code_t"), 16f, FontWeight.ExtraBold, modifier = Modifier.padding(top = 30.dp, bottom = 10.dp))
        SelectionContainer { Box(Modifier.fillMaxWidth()) { PField(code, { code = fmtCode(it) }, "XXXX-XXXX-XXXX", caps = KeyboardCapitalization.Characters) } }
        Spacer(Modifier.height(12.dp))
        PBtn(s.t("phipop_use_code"), if (code.length < 14) null else ({
            sc.launch {
                b2 = true
                try { val j = Api.req("POST", "/phipop/redeem", JSONObject().put("code", code)); setSt(j); toast(s.t("phipop_ok")) }
                catch (e: ApiErr) { if (e.code == "phipop_has") { try { setSt(Api.req("GET", "/phipop/status")) } catch (_: Exception) {} }; toast(s.err(e), true) }
                catch (e: Exception) { toast(s.err(e), true) }
                b2 = false
            }
        }), loading = b2, ghost = true)
    }
}

@Composable private fun ColumnScope.PhipopChat(cur: JSONObject, msgs: androidx.compose.runtime.snapshots.SnapshotStateList<JSONObject>, setSt: (JSONObject) -> Unit) {
    val s = Store; val sc = rememberCoroutineScope()
    var text by remember { mutableStateOf("") }; var busy by remember { mutableStateOf(false) }; var loaded by remember { mutableStateOf(false) }
    val ls = rememberLazyListState()
    var now by remember { mutableStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) { while (true) { kotlinx.coroutines.delay(30000); now = System.currentTimeMillis() } }
    LaunchedEffect(Unit) {
        try {
            val j = Api.req("GET", "/phipop/chat"); val a = j.optJSONArray("items") ?: JSONArray()
            msgs.clear(); for (i in 0 until a.length()) msgs.add(a.getJSONObject(i)); setSt(j)
        } catch (e: ApiErr) { toast(s.err(e), true); if (e.code == "phipop_locked") { try { setSt(Api.req("GET", "/phipop/status")) } catch (_: Exception) {} } }
        catch (e: Exception) { toast(s.err(e), true) }
        loaded = true
    }
    LaunchedEffect(msgs.size, busy, loaded) { val n = msgs.size + if (busy) 1 else 0; if (n > 0) ls.animateScrollToItem(n - 1) }
    val limit = cur.lng("limit"); val left = cur.lng("left"); val resetAt = cur.optLong("reset_at")
    val out = limit != null && left != null && left <= 0
    @Suppress("UNUSED_EXPRESSION") now
    fun send() {
        val t = text.trim(); if (t.isEmpty() || busy || out) return
        busy = true; text = ""
        val mine = JSONObject().put("id", -System.nanoTime()).put("role", "user").put("text", t).put("created", System.currentTimeMillis()); msgs.add(mine)
        sc.launch {
            try {
                val j = Api.req("POST", "/phipop/chat", JSONObject().put("text", t))
                msgs.add(JSONObject().put("id", -System.nanoTime()).put("role", "phipop").put("text", j.optString("reply")).put("created", System.currentTimeMillis())); setSt(j)
            } catch (e: ApiErr) {
                msgs.remove(mine); text = t; toast(s.err(e), true)
                if (e.code == "phipop_limit" || e.code == "phipop_locked") { try { setSt(Api.req("GET", "/phipop/status")) } catch (_: Exception) {} }
            } catch (e: Exception) { msgs.remove(mine); text = t; toast(s.err(e), true) }
            busy = false
        }
    }
    if (msgs.isEmpty() && loaded && !busy) Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) { PhipopLogo(72.dp); HText(s.t("phipop_empty"), 15f, color = sub(), modifier = Modifier.padding(top = 12.dp)) }
    } else LazyColumn(Modifier.weight(1f).fillMaxWidth(), state = ls, contentPadding = PaddingValues(16.dp, 6.dp, 16.dp, 10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        itemsIndexed(msgs.toList(), key = { _, m -> m.optLong("id") }) { _, m ->
            val mineB = m.optString("role") == "user"
            Row(Modifier.fillMaxWidth(), horizontalArrangement = if (mineB) Arrangement.End else Arrangement.Start, verticalAlignment = Alignment.Bottom) {
                if (!mineB) { PhipopLogo(28.dp); Spacer(Modifier.width(8.dp)) }
                Box(Modifier.widthIn(max = 290.dp).clip(RoundedCornerShape(20.dp, 20.dp, if (mineB) 6.dp else 20.dp, if (mineB) 20.dp else 6.dp)).background(if (mineB) ink() else soft()).padding(14.dp, 10.dp)) {
                    SelectionContainer { HText(m.optString("text"), 15f, color = if (mineB) bgOf() else ink(), lh = 21f) }
                }
            }
        }
        if (busy) item(key = "typing") {
            Row(verticalAlignment = Alignment.Bottom) { PhipopLogo(28.dp); Spacer(Modifier.width(8.dp)); Box(Modifier.clip(RoundedCornerShape(20.dp, 20.dp, 20.dp, 6.dp)).background(soft()).padding(14.dp, 10.dp)) { HText(s.t("phipop_typing"), 13.5f, color = sub()) } }
        }
    }
    Column(Modifier.fillMaxWidth().padding(16.dp, 4.dp, 16.dp, 12.dp).navigationBarsPadding()) {
        val info = if (limit == null || left == null) s.t("phipop_unl")
            else if (resetAt > 0) s.t("phipop_left").replace("{l}", "$left").replace("{n}", "$limit").replace("{t}", leftTime(resetAt)) else s.t("phipop_left0").replace("{l}", "$left").replace("{n}", "$limit")
        if (out) HText(s.t("phipop_out").replace("{t}", if (resetAt > 0) leftTime(resetAt) else "…"), 13.5f, FontWeight.SemiBold, modifier = Modifier.padding(start = 6.dp, bottom = 8.dp))
        else HText(info, 12f, color = sub(), modifier = Modifier.padding(start = 6.dp, bottom = 6.dp))
        Row(verticalAlignment = Alignment.Bottom) {
            Box(Modifier.weight(1f).alpha(if (out) .45f else 1f)) { PField(text, { text = it.take(600) }, s.t("phipop_input_ph"), max = 5, enabled = !out) }
            Spacer(Modifier.width(10.dp))
            Tap(onTap = if (out || busy || text.isBlank()) null else ({ send() })) {
                Box(Modifier.size(48.dp).background(if (out || text.isBlank()) ink().copy(alpha = .25f) else ink(), CircleShape), contentAlignment = Alignment.Center) { Icon(Icons.Rounded.ArrowUpward, null, Modifier.size(24.dp), tint = bgOf()) }
            }
        }
    }
}

// ───────── admin Phipop ─────────
@Composable fun PhipopAdminPage() {
    val s = Store; val sc = rememberCoroutineScope()
    var data by remember { mutableStateOf<JSONObject?>(null) }
    val codes = remember { mutableStateMapOf<Int, String>() }
    var user by remember { mutableStateOf("") }; var exempt by remember { mutableStateOf(false) }; var lim by remember { mutableStateOf("") }; var busy by remember { mutableStateOf(false) }
    suspend fun load() { try { data = Api.req("GET", "/phipop/admin") } catch (e: Exception) { toast(s.err(e), true) } }
    LaunchedEffect(Unit) { if (s.me == null) Nav.replace(Screen("/login") { AuthPage() }) else load() }
    Column(Modifier.fillMaxSize()) {
        TopBar(back = true, title = s.t("pa_title"))
        val d = data
        if (d == null) { Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) { androidx.compose.material3.CircularProgressIndicator(Modifier.size(28.dp), color = ink(), strokeWidth = 2.5.dp) }; return@Column }
        val reqs = d.optJSONArray("requests") ?: JSONArray(); val acc = d.optJSONArray("access") ?: JSONArray()
        val pending = (0 until reqs.length()).map { reqs.getJSONObject(it) }.filter { it.optString("status") == "pending" }
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(22.dp, 4.dp, 22.dp, 40.dp)) {
            HText(s.t("pa_req"), 18f, FontWeight.ExtraBold, modifier = Modifier.padding(bottom = 10.dp))
            if (pending.isEmpty()) HText(s.t("pa_none"), 14f, color = sub(), modifier = Modifier.padding(bottom = 10.dp))
            pending.forEach { r ->
                val id = r.optInt("id")
                Column(Modifier.padding(bottom = 12.dp).fillMaxWidth().background(soft(), RoundedCornerShape(22.dp)).padding(16.dp)) {
                    HText("${r.optString("name")} · @${r.optString("username")}", 15f, FontWeight.ExtraBold)
                    SelectionContainer { HText(r.optString("why"), 14f, color = sub(), modifier = Modifier.padding(top = 6.dp), lh = 20f) }
                    val c = codes[id]
                    if (c != null) {
                        HText(s.t("pa_code"), 12f, color = sub(), modifier = Modifier.padding(top = 10.dp))
                        SelectionContainer { HText(c, 20f, FontWeight.ExtraBold, Brand) }
                    } else Row(Modifier.padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Box(Modifier.weight(1f)) { PBtn(s.t("pa_send"), { sc.launch {
                            try { val j = Api.req("POST", "/phipop/admin/send", JSONObject().put("request_id", id)); codes[id] = j.optString("code").ifEmpty { "✓" } } catch (e: Exception) { toast(s.err(e), true) }
                        } }) }
                        Box(Modifier.weight(1f)) { PBtn(s.t("pa_reject"), { sc.launch {
                            if (!confirm(s.t("pa_reject"), s.t("pa_reject_q").replace("{u}", r.optString("username")), s.t("pa_reject"), danger = true)) return@launch
                            try { Api.req("POST", "/phipop/admin/reject", JSONObject().put("request_id", id)); load() } catch (e: Exception) { toast(s.err(e), true) }
                        } }, ghost = true) }
                    }
                }
            }
            HText(s.t("pa_grant"), 18f, FontWeight.ExtraBold, modifier = Modifier.padding(top = 18.dp, bottom = 10.dp))
            PField(user, { user = it.trim().removePrefix("@").lowercase() }, s.t("pa_user"), caps = KeyboardCapitalization.None)
            Row(Modifier.padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) { HText(s.t("pa_unl"), 15f, FontWeight.SemiBold, modifier = Modifier.weight(1f)); Toggle(exempt) { exempt = it } }
            if (!exempt) { PField(lim, { lim = it.filter { c -> c.isDigit() }.take(5) }, s.t("pa_lim")); Spacer(Modifier.height(12.dp)) }
            PBtn(s.t("pa_save"), if (user.isEmpty()) null else ({ sc.launch {
                busy = true
                try {
                    val b = JSONObject().put("username", user).put("exempt", exempt)
                    if (!exempt && lim.isNotEmpty()) b.put("lim", lim.toInt())
                    Api.req("POST", "/phipop/admin/grant", b); toast("✓"); user = ""; lim = ""; exempt = false; load()
                } catch (e: Exception) { toast(s.err(e), true) }
                busy = false
            } }), loading = busy)
            HText(s.t("pa_access"), 18f, FontWeight.ExtraBold, modifier = Modifier.padding(top = 26.dp, bottom = 10.dp))
            for (i in 0 until acc.length()) {
                val a = acc.getJSONObject(i); val u = a.optString("username")
                Row(Modifier.padding(bottom = 8.dp).fillMaxWidth().background(soft(), RoundedCornerShape(20.dp)).padding(16.dp, 10.dp, 6.dp, 10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        HText("${a.optString("name")} · @$u", 14.5f, FontWeight.Bold, maxLines = 1)
                        val l = if (a.optBoolean("exempt")) s.t("pa_unl") else if (a.isNull("lim")) "—" else "${a.optInt("lim")}"
                        HText("$l · ${a.optInt("used")} ${s.t("pa_used")}", 12.5f, color = sub())
                    }
                    Tap(onTap = { sc.launch { if (!confirm(s.t("pa_revoke"), s.t("pa_revoke_q").replace("{u}", u), s.t("pa_revoke"), danger = true)) return@launch; try { Api.req("POST", "/phipop/admin/grant", JSONObject().put("username", u).put("revoke", true)); load() } catch (e: Exception) { toast(s.err(e), true) } } }) { HText(s.t("pa_revoke"), 13f, FontWeight.ExtraBold, Heart, Modifier.padding(12.dp)) }
                }
            }
        }
    }
}
