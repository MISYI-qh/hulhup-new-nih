package app.misyi.hulhup

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.Icon
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.roundToInt

/* ───────── waktu tersisa ───────── */
fun leftText(ms: Long): String {
    val s = Store; val m = (ms / 60000.0).roundToInt().coerceAtLeast(1)
    return if (m >= 1440) { val d = m / 1440; val h = ((m % 1440) / 60.0).roundToInt(); "$d ${s.t("exp_day")}" + if (h > 0 && d < 3) " $h ${s.t("exp_hour")}" else "" }
    else if (m >= 60) { val h = m / 60; val mm = m % 60; "$h ${s.t("exp_hour")}" + if (mm > 0) " $mm ${s.t("exp_min")}" else "" }
    else "$m ${s.t("exp_min")}"
}

@Composable private fun Chip(icon: androidx.compose.ui.graphics.vector.ImageVector, text: String, color: Color = sub()) =
    Row(Modifier.padding(top = 8.dp, end = 8.dp).background(soft(), RoundedCornerShape(12.dp)).padding(9.dp, 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, Modifier.size(14.dp), tint = color); Spacer(Modifier.width(5.dp)); HText(text, 12f, FontWeight.Bold, color)
    }

/** "Berakhir dalam …" untuk post yang punya masa aktif (menyegarkan diri tiap 30 dtk). */
@Composable fun ExpiryChip(a: A) {
    if (a.expiresAt <= 0) return
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(a.expiresAt) { while (true) { delay(30000); now = System.currentTimeMillis() } }
    val left = a.expiresAt - now
    Chip(Icons.Rounded.Schedule, if (left <= 0) "…" else Store.t("exp_chip").replace("{t}", leftText(left)), if (left < 3600000) Color(0xFFE0524A) else sub())
}
@Composable fun PinTag() = Chip(Icons.Rounded.PushPin, Store.t("pinned_tag"))

@Composable fun SegRow(items: List<Pair<String, String>>, value: String, h: Int = 44, on: (String) -> Unit) {
    Row(Modifier.fillMaxWidth().background(soft(), RoundedCornerShape(24.dp)).padding(3.dp)) {
        for ((k, l) in items) Tap(Modifier.weight(1f), .97f, onTap = { on(k) }) {
            Box(Modifier.fillMaxWidth().height((h - 6).dp).background(if (k == value) ink() else Color.Transparent, RoundedCornerShape(21.dp)), contentAlignment = Alignment.Center) {
                HText(l, 13.5f, FontWeight.Bold, if (k == value) bgOf() else sub(), maxLines = 1)
            }
        }
    }
}

/* ───────── tampilan voting ───────── */
@Composable fun PollView(a: A) {
    val s = Store; val sc = rememberCoroutineScope()
    var ver by remember { mutableIntStateOf(0) }; ver.let { }
    val p = a.poll ?: return
    var mode by remember { mutableStateOf("pct") }; var sel by remember { mutableStateOf(setOf<Int>()) }
    var editing by remember { mutableStateOf(false) }; var busy by remember { mutableStateOf(false) }
    val max = p.optInt("max", 1); val reveal = p.optBoolean("reveal"); val voted = p.optBoolean("voted"); val multi = max > 1
    val mine = (p.optJSONArray("mine") ?: JSONArray()).let { m -> (0 until m.length()).map { m.optInt(it) } }
    val opts = (p.optJSONArray("options") ?: JSONArray()).objects()
    val total = if (p.isNull("total")) 0 else p.optInt("total")
    val ended = p.optBoolean("ended") || (p.optLong("ends_at") in 1..System.currentTimeMillis())
    val showRes = reveal && !editing
    val top = if (showRes) opts.maxOfOrNull { if (it.isNull("votes")) 0 else it.optInt("votes") } ?: 0 else 0
    fun pct(v: Int) = if (total > 0) (v * 100f / total).roundToInt() else 0
    suspend fun send(ids: List<Int>) {
        if (busy || ended) return
        if (s.me == null) { toast(s.t("need_login"), true); return }
        busy = true
        try { val j = Api.req("POST", "/posts/${a.id}/vote", JSONObject().put("options", JSONArray(ids))); a.poll = j.getJSONObject("poll"); editing = false; sel = emptySet(); ver++ }
        catch (e: Exception) { toast(s.err(e), true) }
        busy = false
    }
    fun pick(id: Int) {
        if (busy) return
        if (!multi) { sc.launch { send(listOf(id)) }; return }
        sel = if (sel.contains(id)) sel - id else if (sel.size >= max) { toast(s.t("poll_max_err").replace("{n}", "$max"), true); sel } else sel + id
    }
    Column(Modifier.padding(top = 12.dp, end = 8.dp).fillMaxWidth().background(soft(), RoundedCornerShape(22.dp)).padding(14.dp)) {
        val title = p.optString("title")
        if (title.isNotEmpty()) HText(title, 16.5f, FontWeight.ExtraBold, modifier = Modifier.padding(start = 2.dp, bottom = 12.dp), lh = 21f)
        if (showRes) Box(Modifier.padding(bottom = 10.dp)) { SegRow(listOf("pct" to s.t("poll_pct"), "cnt" to s.t("poll_cnt")), mode, 36) { mode = it } }
        else if (multi) HText(s.t("poll_upto").replace("{n}", "$max"), 12.5f, FontWeight.SemiBold, sub(), Modifier.padding(start = 2.dp, bottom = 10.dp))
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            for (o in opts) {
                val id = o.optInt("id"); val label = o.optString("label"); val v = if (o.isNull("votes")) 0 else o.optInt("votes")
                val isMine = mine.contains(id); val on = sel.contains(id)
                if (showRes) {
                    val target = if (mode == "pct") pct(v) / 100f else if (top > 0) v.toFloat() / top else 0f
                    val frac by animateFloatAsState(target, tween(500), label = "pf")
                    val lead = v == top && v > 0
                    Tap(Modifier.fillMaxWidth(), .99f, onTap = if (!voted && !busy && !ended) ({ pick(id) }) else null) {
                        Box(Modifier.fillMaxWidth().heightIn(min = 46.dp).clip(RoundedCornerShape(15.dp)).background(bgOf()).border(1.4.dp, if (isMine) ink() else ink().copy(alpha = .07f), RoundedCornerShape(15.dp))) {
                            Box(Modifier.matchParentSize()) { Box(Modifier.fillMaxWidth(frac.coerceIn(0f, 1f)).fillMaxHeight().background(ink().copy(alpha = if (lead) .17f else .1f))) }
                            Row(Modifier.fillMaxWidth().padding(14.dp, 10.dp), verticalAlignment = Alignment.CenterVertically) {
                                if (isMine) { Icon(Icons.Rounded.CheckCircle, null, Modifier.size(17.dp), tint = ink()); Spacer(Modifier.width(7.dp)) }
                                HText(label, 15f, if (lead) FontWeight.ExtraBold else FontWeight.SemiBold, modifier = Modifier.weight(1f))
                                Spacer(Modifier.width(8.dp))
                                HText(if (mode == "pct") "${pct(v)}%" else "$v", 14f, if (lead) FontWeight.ExtraBold else FontWeight.SemiBold)
                            }
                        }
                    }
                } else {
                    Tap(Modifier.fillMaxWidth(), .99f, onTap = if (!busy) ({ pick(id) }) else null) {
                        Row(Modifier.fillMaxWidth().heightIn(min = 46.dp).clip(RoundedCornerShape(15.dp)).background(bgOf()).border(1.4.dp, if (on) ink() else ink().copy(alpha = .07f), RoundedCornerShape(15.dp)).padding(14.dp, 10.dp), verticalAlignment = Alignment.CenterVertically) {
                            Box(Modifier.size(20.dp).border(1.8.dp, if (on) ink() else ink().copy(alpha = .35f), if (multi) RoundedCornerShape(6.dp) else CircleShape).background(if (on) ink() else Color.Transparent, if (multi) RoundedCornerShape(6.dp) else CircleShape), contentAlignment = Alignment.Center) {
                                if (on) Icon(Icons.Rounded.Check, null, Modifier.size(14.dp), tint = bgOf())
                            }
                            Spacer(Modifier.width(12.dp)); HText(label, 15f, FontWeight.SemiBold, modifier = Modifier.weight(1f))
                        }
                    }
                }
            }
        }
        Row(Modifier.padding(top = 12.dp, start = 2.dp).fillMaxWidth().heightIn(min = 30.dp), verticalAlignment = Alignment.CenterVertically) {
            Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
                if (!reveal) { Icon(Icons.Rounded.Lock, null, Modifier.size(13.dp), tint = sub()); Spacer(Modifier.width(4.dp)); HText(s.t("poll_hidden"), 12.5f, FontWeight.SemiBold, sub()) }
                else HText(if (total > 0) s.t("poll_total").replace("{n}", s.fmt(total)) else s.t("poll_none"), 12.5f, FontWeight.SemiBold, sub())
            }
            if (ended) HText(s.t("poll_ended"), 12.5f, FontWeight.ExtraBold, sub(), Modifier.padding(end = 8.dp))
            else if (p.optLong("ends_at") > 0) HText(s.t("poll_left").replace("{t}", leftText(p.optLong("ends_at") - System.currentTimeMillis())), 12.5f, FontWeight.ExtraBold, sub(), Modifier.padding(end = 8.dp))
            if (showRes && voted && !ended) Tap(onTap = { sel = mine.toSet(); editing = true }) { HText(s.t("poll_change"), 13f, FontWeight.ExtraBold, modifier = Modifier.padding(6.dp, 6.dp)) }
            if (editing) Tap(onTap = { editing = false }) { HText(s.t("cancel"), 13f, FontWeight.ExtraBold, sub(), Modifier.padding(6.dp, 6.dp)) }
            if (!showRes && (multi || editing)) Tap(onTap = if (!busy && sel.isNotEmpty()) ({ sc.launch { send(sel.toList()) } }) else null) {
                Box(Modifier.background(ink().copy(alpha = if (sel.isEmpty() || busy) .4f else 1f), RoundedCornerShape(16.dp)).padding(16.dp, 8.dp)) { HText(if (busy) "…" else s.t("poll_submit"), 13f, FontWeight.ExtraBold, bgOf()) }
            }
        }
    }
}

/* ───────── penyusun voting ───────── */
class PollDraft {
    val ends = ExpDraft(); var title by mutableStateOf(""); val opts = mutableStateListOf("", ""); var max by mutableIntStateOf(1); var showFirst by mutableStateOf(true)
    fun filled() = opts.map { it.trim() }.filter { it.isNotEmpty() }
    fun bad(): Boolean { val f = filled(); return f.size < 2 || f.map { it.lowercase() }.toSet().size != f.size }
    fun json(): JSONObject = JSONObject().put("title", title.trim()).put("options", JSONArray(filled())).put("max", max.coerceAtMost(filled().size.coerceAtLeast(1))).put("show_first", showFirst).also { if (ends.ms() > 0) it.put("ends_in", ends.ms()) }
}

@Composable private fun XField(v: String, on: (String) -> Unit, ph: String, modifier: Modifier = Modifier, bold: Boolean = false, kb: KeyboardType = KeyboardType.Text, max: Int = 100) {
    Box(modifier.heightIn(min = 46.dp).background(bgOf(), RoundedCornerShape(14.dp)).border(1.4.dp, ink().copy(alpha = .07f), RoundedCornerShape(14.dp)).padding(14.dp, 0.dp), contentAlignment = Alignment.CenterStart) {
        if (v.isEmpty()) HText(ph, 16f, color = sub())
        BasicTextField(v, { on(it.take(max)) }, Modifier.fillMaxWidth(), textStyle = TextStyle(fontSize = 16.sp, fontWeight = if (bold) FontWeight.ExtraBold else FontWeight.Normal, color = ink(), fontFamily = Outfit), cursorBrush = SolidColor(ink()), singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = kb))
    }
}
@Composable private fun XHead(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, onClose: () -> Unit) {
    Row(Modifier.padding(bottom = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, Modifier.size(19.dp), tint = ink()); Spacer(Modifier.width(8.dp)); HText(title, 15f, FontWeight.ExtraBold, modifier = Modifier.weight(1f))
        Tap(onTap = onClose) { Box(Modifier.size(32.dp), contentAlignment = Alignment.Center) { Icon(Icons.Rounded.Close, null, Modifier.size(18.dp), tint = sub()) } }
    }
}

@Composable fun PollEditor(d: PollDraft, onClose: () -> Unit) {
    val s = Store; val cap = d.opts.size.coerceAtLeast(1)
    Column(Modifier.padding(top = 12.dp).fillMaxWidth().background(soft(), RoundedCornerShape(22.dp)).padding(14.dp)) {
        XHead(Icons.Rounded.Poll, s.t("poll"), onClose)
        XField(d.title, { d.title = it }, s.t("poll_title_ph"), Modifier.fillMaxWidth().padding(bottom = 10.dp), bold = true, max = 200)
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            d.opts.forEachIndexed { i, o ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    XField(o, { d.opts[i] = it }, s.t("poll_opt_n").replace("{n}", "${i + 1}"), Modifier.weight(1f))
                    if (d.opts.size > 2) Tap(onTap = { d.opts.removeAt(i); if (d.max > d.opts.size) d.max = d.opts.size }) { Box(Modifier.size(36.dp), contentAlignment = Alignment.Center) { Icon(Icons.Rounded.Remove, null, Modifier.size(18.dp), tint = sub()) } } else Spacer(Modifier.width(36.dp))
                }
            }
        }
        Tap(onTap = { d.opts.add("") }) { Row(Modifier.padding(top = 10.dp, bottom = 4.dp, start = 4.dp, end = 8.dp, ).padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Rounded.Add, null, Modifier.size(18.dp), tint = ink()); Spacer(Modifier.width(6.dp)); HText(s.t("poll_add_opt"), 14f, FontWeight.ExtraBold) } }
        Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            HText(s.t("poll_max_l"), 15f, FontWeight.Bold, modifier = Modifier.weight(1f))
            Row(Modifier.background(bgOf(), RoundedCornerShape(18.dp)).padding(3.dp), verticalAlignment = Alignment.CenterVertically) {
                Tap(onTap = if (d.max > 1) ({ d.max-- }) else null) { Box(Modifier.size(34.dp), contentAlignment = Alignment.Center) { Icon(Icons.Rounded.Remove, null, Modifier.size(18.dp), tint = ink().copy(alpha = if (d.max > 1) 1f else .3f)) } }
                Box(Modifier.widthIn(min = 26.dp), contentAlignment = Alignment.Center) { HText("${d.max.coerceAtMost(cap)}", 15f, FontWeight.ExtraBold) }
                Tap(onTap = if (d.max < cap) ({ d.max++ }) else null) { Box(Modifier.size(34.dp), contentAlignment = Alignment.Center) { Icon(Icons.Rounded.Add, null, Modifier.size(18.dp), tint = ink().copy(alpha = if (d.max < cap) 1f else .3f)) } }
            }
        }
        Row(Modifier.padding(top = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) { HText(s.t("poll_show_l"), 15f, FontWeight.Bold); HText(s.t("poll_show_d"), 12.5f, color = sub()) }
            Toggle(d.showFirst) { d.showFirst = it }
        }
        HText(s.t("poll_end"), 15f, FontWeight.Bold, modifier = Modifier.padding(top = 14.dp, bottom = 8.dp))
        SegRow(listOf("0" to s.t("poll_end_none"), "1" to s.t("poll_end_set")), if (d.ends.custom) "1" else "0") { d.ends.custom = it == "1" }
        if (d.ends.custom) DurPick(d.ends) else HText(s.t("poll_end_d"), 12.5f, color = sub(), modifier = Modifier.padding(top = 8.dp), lh = 17f)
        if (d.filled().size < 2) HText(s.t("poll_need"), 12.5f, color = Color(0xFFE0524A), modifier = Modifier.padding(top = 8.dp))
    }
}

/* ───────── pemilih masa aktif ───────── */
class ExpDraft {
    var custom by mutableStateOf(false); var n by mutableStateOf("1"); var unit by mutableStateOf("day")
    fun ms(): Long { if (!custom) return 0; val v = n.replace(',', '.').toDoubleOrNull() ?: return 0; if (v <= 0) return 0; return (v * when (unit) { "min" -> 60000.0; "hour" -> 3600000.0; else -> 86400000.0 }).toLong() }
}
@Composable fun ExpiryEditor(d: ExpDraft, onClose: () -> Unit) {
    val s = Store; val ms = d.ms()
    Column(Modifier.padding(top = 12.dp).fillMaxWidth().background(soft(), RoundedCornerShape(22.dp)).padding(14.dp)) {
        XHead(Icons.Rounded.Schedule, s.t("exp"), onClose)
        SegRow(listOf("0" to s.t("exp_normal"), "1" to s.t("exp_custom")), if (d.custom) "1" else "0") { d.custom = it == "1" }
        HText(if (d.custom) s.t("exp_custom_d") else s.t("exp_normal_d"), 12.5f, color = sub(), modifier = Modifier.padding(top = 10.dp), lh = 17f)
        if (d.custom) DurPick(d)
    }
}

@Composable fun DurPick(d: ExpDraft) {
    val s = Store; val ms = d.ms()
    Column {
            Row(Modifier.padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                for ((n, u, l) in listOf(Triple("1", "hour", "1 jam"), Triple("6", "hour", "6 jam"), Triple("1", "day", "1 hari"), Triple("3", "day", "3 hari"), Triple("7", "day", "7 hari"))) {
                    val on = d.n == n && d.unit == u
                    Tap(onTap = { d.n = n; d.unit = u }) { Box(Modifier.background(if (on) ink() else bgOf(), RoundedCornerShape(17.dp)).border(1.4.dp, if (on) ink() else ink().copy(alpha = .07f), RoundedCornerShape(17.dp)).padding(10.dp, 8.dp)) { HText(l, 12.5f, FontWeight.Bold, if (on) bgOf() else ink(), maxLines = 1) } }
                }
            }
            Row(Modifier.padding(top = 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                XField(d.n, { d.n = it.filter { c -> c.isDigit() || c == '.' || c == ',' }.take(7) }, "1", Modifier.width(88.dp), bold = true, kb = KeyboardType.Decimal)
                Box(Modifier.weight(1f)) { SegRow(listOf("min" to s.t("exp_min"), "hour" to s.t("exp_hour"), "day" to s.t("exp_day")), d.unit, 46) { d.unit = it } }
            }
            HText(if (ms > 0) s.t("exp_set").replace("{t}", leftText(ms)) else s.t("exp_bad"), 12.5f, color = if (ms > 0) sub() else Color(0xFFE0524A), modifier = Modifier.padding(top = 8.dp))
    }
}

/* ───────── pin ───────── */
@Composable fun PinPill(n: Int, onOpen: () -> Unit) {
    if (n <= 0) return
    Box(Modifier.fillMaxWidth().padding(top = 8.dp), contentAlignment = Alignment.TopCenter) {
        Tap(onTap = onOpen) {
            Row(Modifier.height(36.dp).background(ink(), RoundedCornerShape(18.dp)).padding(11.dp, 0.dp, 8.dp, 0.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Rounded.PushPin, null, Modifier.size(16.dp), tint = bgOf()); Spacer(Modifier.width(6.dp)); HText(Store.t("pin_n").replace("{n}", "$n"), 13f, FontWeight.ExtraBold, bgOf())
                Icon(Icons.Rounded.ExpandMore, null, Modifier.size(18.dp), tint = bgOf())
            }
        }
    }
}
