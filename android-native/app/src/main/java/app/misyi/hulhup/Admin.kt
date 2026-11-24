package app.misyi.hulhup

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Verified
import androidx.compose.material3.Icon
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

private val badgeCol = mapOf("purple" to Color(0xFF8B5CF6), "blue" to Blue, "orange" to Color(0xFFFF7A1A))

/** Dasbor admin (hanya akun hulhup): Ringkasan, Laporan, Centang, Phipop. Padanan web components/admin.tsx. */
@Composable fun AdminPage() {
    val s = Store; var tab by remember { mutableIntStateOf(0) }
    Column(Modifier.fillMaxSize()) {
        TopBar(back = true, title = s.t("adm_title"))
        if (s.me?.username != "hulhup") { HText(s.t("adm_only"), 15f, color = sub(), modifier = Modifier.padding(22.dp)); return@Column }
        Row(Modifier.padding(22.dp, 0.dp, 22.dp, 12.dp).fillMaxWidth().background(soft(), RoundedCornerShape(26.dp)).padding(4.dp)) {
            for (i in 0..3) Tap(Modifier.weight(1f), .97f, onTap = { tab = i }) {
                Box(Modifier.fillMaxWidth().height(40.dp).background(if (tab == i) ink() else Color.Transparent, RoundedCornerShape(22.dp)), contentAlignment = Alignment.Center) {
                    HText(s.t("adm_t$i"), 13f, FontWeight.ExtraBold, if (tab == i) bgOf() else sub(), maxLines = 1)
                }
            }
        }
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(22.dp, 0.dp, 22.dp, 40.dp)) {
            when (tab) { 0 -> AdminOverview(); 1 -> AdminReports(); 2 -> AdminBadges(); else -> PhipopAdminBody() }
        }
    }
}

@Composable private fun Card(content: @Composable ColumnScope.() -> Unit) =
    Column(Modifier.padding(bottom = 10.dp).fillMaxWidth().background(soft(), RoundedCornerShape(22.dp)).padding(14.dp), content = content)

@Composable private fun Spin() = Box(Modifier.fillMaxWidth().padding(30.dp), contentAlignment = Alignment.Center) { androidx.compose.material3.CircularProgressIndicator(Modifier.size(26.dp), color = ink(), strokeWidth = 2.4.dp) }

@Composable private fun AdminOverview() {
    val s = Store; var d by remember { mutableStateOf<JSONObject?>(null) }
    LaunchedEffect(Unit) { try { d = Api.req("GET", "/admin/overview") } catch (e: Exception) { toast(s.err(e), true) } }
    val o = d ?: run { Spin(); return }
    val b = o.optJSONObject("badges") ?: JSONObject()
    @Composable fun row(k: String, v: String) = Row(Modifier.padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) { HText(k, 14.5f, color = sub(), modifier = Modifier.weight(1f)); HText(v, 15f, FontWeight.ExtraBold) }
    Card {
        row(s.t("adm_users"), "${o.optInt("users")}"); row(s.t("adm_posts"), "${o.optInt("posts")}")
        row(s.t("adm_badges"), "${b.optInt("purple")} / ${b.optInt("blue")} / ${b.optInt("orange")}")
        row(s.t("adm_holders"), "${o.optInt("ai_holders")}"); row(s.t("adm_pending"), "${o.optInt("ai_pending")}")
        row(s.t("adm_pposts"), "${o.optInt("ai_posts_today")} / 2")
        row(s.t("adm_quota"), "${fmtH(o.optDouble("ai_default_limit"))} ${s.t("adm_hours")} / ${fmtH(o.optDouble("ai_window_hours"))} ${s.t("adm_hours")}")
    }
}

/** Take down: alasan wajib (dikirim ke pemilik lewat notifikasi), lalu konfirmasi. */
private suspend fun takedown(body: JSONObject, done: suspend () -> Unit) {
    val s = Store
    val reason = sheet<String> { fin -> var r by remember { mutableStateOf("") }; Column {
        HText(s.t("adm_reason_t"), 18f, FontWeight.ExtraBold, modifier = Modifier.padding(bottom = 12.dp))
        PField(r, { r = it.take(300) }, s.t("adm_reason_ph"), min = 2, max = 5); Spacer(Modifier.height(14.dp))
        PBtn(s.t("adm_td"), if (r.isBlank()) null else ({ fin(r.trim()) }))
    } }?.trim().orEmpty()
    if (reason.isEmpty()) return
    if (!confirm(s.t("adm_td"), s.t("adm_td_q"), s.t("adm_td"), danger = true)) return
    try { Api.req("POST", "/admin/takedown", body.put("reason", reason)); toast(s.t("adm_td_done")); done() } catch (e: Exception) { toast(s.err(e), true) }
}

@Composable private fun AdminReports() {
    val s = Store; val sc = rememberCoroutineScope()
    var d by remember { mutableStateOf<JSONObject?>(null) }; var ref by remember { mutableStateOf("") }
    suspend fun load() { try { d = Api.req("GET", "/admin/reports") } catch (e: Exception) { toast(s.err(e), true) } }
    LaunchedEffect(Unit) { load() }
    val o = d ?: run { Spin(); return }
    Card {
        HText(s.t("adm_td_now"), 15.5f, FontWeight.ExtraBold)
        Spacer(Modifier.height(8.dp)); PField(ref, { ref = it }, s.t("adm_td_ph")); Spacer(Modifier.height(10.dp))
        PBtn(s.t("adm_td_btn"), if (ref.isBlank()) null else ({ sc.launch { takedown(JSONObject().put("ref", ref.trim())) { ref = ""; load() } } }))
    }
    val rs = o.optJSONArray("reports") ?: JSONArray()
    if (rs.length() == 0) HText(s.t("adm_no_reports"), 14f, color = sub(), modifier = Modifier.padding(vertical = 10.dp))
    for (i in 0 until rs.length()) {
        val r = rs.getJSONObject(i); val cm = r.optInt("comment"); val post = r.optInt("post")
        Card {
            Row(verticalAlignment = Alignment.CenterVertically) {
                HText("${s.t(if (cm != 0) "adm_rep_cmt" else if (post != 0) "adm_rep_post" else "adm_rep_user")} @${r.optString("target")}", 14.5f, FontWeight.ExtraBold, modifier = Modifier.weight(1f))
                HText(s.t("adm_rep_from").replace("{u}", r.optString("reporter").ifEmpty { "?" }), 12f, color = sub())
            }
            val tx = r.optString("comment_text").ifEmpty { r.optString("post_text") }
            if (tx.isNotEmpty()) HText(tx, 14.5f, modifier = Modifier.padding(top = 6.dp), maxLines = 6, lh = 20f)
            HText(s.t("adm_rep_why").replace("{r}", r.optString("reason")), 13f, color = sub(), modifier = Modifier.padding(top = 6.dp, bottom = 10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                if (cm != 0 || post != 0) Box(Modifier.weight(1f)) { PBtn(s.t("adm_td"), { sc.launch { takedown(if (cm != 0) JSONObject().put("comment", cm) else JSONObject().put("audio", post)) { load() } } }) }
                Box(Modifier.weight(1f)) { PBtn(s.t("adm_dismiss"), { sc.launch { try { Api.req("POST", "/admin/reports/${r.optInt("id")}/dismiss"); load() } catch (e: Exception) { toast(s.err(e), true) } } }, ghost = true) }
            }
        }
    }
}

@Composable private fun AdminBadges() {
    val s = Store; val sc = rememberCoroutineScope()
    var q by remember { mutableStateOf("") }; var d by remember { mutableStateOf<JSONObject?>(null) }
    suspend fun load() { try { d = Api.req("GET", "/admin/users?q=${java.net.URLEncoder.encode(q, "UTF-8")}") } catch (e: Exception) { toast(s.err(e), true) } }
    LaunchedEffect(q) { kotlinx.coroutines.delay(250); load() }
    HText(s.t("adm_badge_note"), 13f, color = sub(), modifier = Modifier.padding(bottom = 10.dp), lh = 18f)
    PField(q, { q = it }, s.t("adm_search")); Spacer(Modifier.height(10.dp))
    val us = d?.optJSONArray("users") ?: run { Spin(); return }
    for (i in 0 until us.length()) {
        val u = us.getJSONObject(i); val cur = if (u.isNull("badge")) null else u.optString("badge").ifEmpty { null }
        Card {
            Row(verticalAlignment = Alignment.CenterVertically) {
                HText(u.optString("name"), 15f, FontWeight.ExtraBold, maxLines = 1, modifier = Modifier.weight(1f, false)); HText("  @${u.optString("username")}", 13.5f, color = sub(), maxLines = 1, modifier = Modifier.weight(1f, false))
                if (cur != null) Icon(Icons.Rounded.Verified, null, Modifier.padding(start = 6.dp).size(16.dp), tint = badgeCol[cur] ?: Blue)
            }
            Row(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                for ((k, label) in listOf(null to "adm_b_none", "purple" to "adm_b_purple", "blue" to "adm_b_blue", "orange" to "adm_b_orange")) {
                    val on = cur == k
                    Tap(onTap = if (on) null else ({ sc.launch {
                        try { Api.req("PUT", "/admin/badge", JSONObject().put("username", u.optString("username")).put("badge", k ?: JSONObject.NULL)); toast(s.t("adm_badge_ok")); s.refresh(); load() } catch (e: Exception) { toast(s.err(e), true) }
                    } })) {
                        Box(Modifier.background(if (on) (badgeCol[k] ?: ink()) else ink().copy(alpha = .08f), RoundedCornerShape(50)).padding(12.dp, 8.dp)) { HText(s.t(label), 12.5f, FontWeight.ExtraBold, if (on) Color.White else ink(), maxLines = 1) }
                    }
                }
            }
        }
    }
}
