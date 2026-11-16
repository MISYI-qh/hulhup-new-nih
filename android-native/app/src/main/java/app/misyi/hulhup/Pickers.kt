package app.misyi.hulhup

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.gestures.snapping.rememberSnapFlingBehavior
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.Icon
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.util.Calendar
import kotlin.math.PI
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

val monthsMap = mapOf(
    "id" to listOf("Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"),
    "en" to listOf("January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"))
fun monthNames(lang: String) = monthsMap[lang] ?: monthsMap["id"]!!

/** Umur dari tanggal lahir (yyyy-MM-dd), selalu mengikuti hari ini (padanan Local.ageOf). */
fun ageOf(iso: String): Int {
    val p = iso.split("-").mapNotNull { it.toIntOrNull() }; if (p.size != 3) return 0
    val n = Calendar.getInstance(); var a = n.get(Calendar.YEAR) - p[0]
    if (n.get(Calendar.MONTH) + 1 < p[1] || (n.get(Calendar.MONTH) + 1 == p[1] && n.get(Calendar.DAY_OF_MONTH) < p[2])) a--
    return a
}
fun daysIn(y: Int, m: Int) = Calendar.getInstance().apply { clear(); set(y, m - 1, 1) }.getActualMaximum(Calendar.DAY_OF_MONTH)

/** Tanggal lahir buatan sendiri: tiga roda (tanggal, bulan, tahun). Umur dihitung otomatis. */
@Composable fun BirthField(label: String, value: String, on: (String) -> Unit) {
    val sc = rememberCoroutineScope()
    val p = value.split("-").mapNotNull { it.toIntOrNull() }.takeIf { it.size == 3 }
    Column {
        HText(label, 13f, FontWeight.SemiBold, sub(), Modifier.padding(start = 6.dp, bottom = 6.dp))
        Tap(scale = .98f, onTap = { sc.launch { pickBirth(value)?.let(on) } }) {
            Row(Modifier.fillMaxWidth().height(56.dp).background(soft(), RoundedCornerShape(28.dp)).padding(horizontal = 18.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.weight(1f)) {
                    AnimatedContent(value, transitionSpec = { (fadeIn(tween(220)) + slideInVertically(tween(220)) { (it * .3f).toInt() }) togetherWith fadeOut(tween(120)) }, label = "bd") { v ->
                        val q = v.split("-").mapNotNull { it.toIntOrNull() }.takeIf { it.size == 3 }
                        HText(if (q == null) "" else "${q[2]} ${monthNames(Store.lang)[q[1] - 1]} ${q[0]}", 16f, FontWeight.Medium)
                    }
                }
                if (p != null) HText("${ageOf(value)} ${Store.t("years")}", 13f, FontWeight.SemiBold, sub(), Modifier.padding(end = 8.dp))
                Icon(Icons.Rounded.UnfoldMore, null, tint = sub())
            }
        }
    }
}

suspend fun pickBirth(cur: String): String? {
    val now = Calendar.getInstance()
    val p = cur.split("-").mapNotNull { it.toIntOrNull() }.takeIf { it.size == 3 } ?: listOf(now.get(Calendar.YEAR) - 18, 1, 1)
    val r = sheet<Triple<Int, Int, Int>> { done -> BirthSheet(p[0], p[1], p[2]) { done(it) } } ?: return null
    return "%04d-%02d-%02d".format(r.first, r.second, r.third)
}

@Composable private fun Wheel(n: Int, init: Int, flex: Float, label: (Int) -> String, on: (Int) -> Unit, modifier: Modifier) {
    val st = rememberLazyListState(init)
    val fling = rememberSnapFlingBehavior(st)
    val hap = androidx.compose.ui.platform.LocalHapticFeedback.current
    var last by remember { mutableIntStateOf(init) }
    LaunchedEffect(st) {
        snapshotFlow { if (st.firstVisibleItemScrollOffset > 26) st.firstVisibleItemIndex + 1 else st.firstVisibleItemIndex }.collect { i ->
            val c = i.coerceIn(0, n - 1); if (c != last) { last = c; hap.performHapticFeedback(androidx.compose.ui.hapticfeedback.HapticFeedbackType.TextHandleMove); on(c) }
        }
    }
    LaunchedEffect(n) { if (st.firstVisibleItemIndex > n - 1) st.scrollToItem(n - 1) }
    LazyColumn(modifier, state = st, flingBehavior = fling, contentPadding = PaddingValues(vertical = 78.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        itemsIndexed(List(n) { it }) { i, _ -> Box(Modifier.height(52.dp), contentAlignment = Alignment.Center) { HText(label(i), 22f, FontWeight.Bold) } }
    }
}

@Composable private fun BirthSheet(y0: Int, m0: Int, d0: Int, done: (Triple<Int, Int, Int>) -> Unit) {
    val now = Calendar.getInstance(); val ny = now.get(Calendar.YEAR); val nm = now.get(Calendar.MONTH) + 1; val nd = now.get(Calendar.DAY_OF_MONTH)
    var d by remember { mutableIntStateOf(d0) }; var m by remember { mutableIntStateOf(m0) }; var y by remember { mutableIntStateOf(y0) }
    val days = daysIn(y, m)
    LaunchedEffect(y, m) {
        if (y == ny && m > nm) m = nm
        if (d > daysIn(y, m)) d = daysIn(y, m)
        if (y == ny && m == nm && d > nd) d = nd
    }
    Column {
        HText(Store.t("age"), 18f, FontWeight.ExtraBold, modifier = Modifier.align(Alignment.CenterHorizontally))
        Spacer(Modifier.height(8.dp))
        Box(Modifier.fillMaxWidth().height(208.dp)) {
            Box(Modifier.align(Alignment.Center).fillMaxWidth().height(52.dp).background(soft(), RoundedCornerShape(26.dp)))
            Row(Modifier.fillMaxSize()) {
                key(y, m) { Wheel(days, d - 1, 2f, { "${it + 1}" }, { d = it + 1 }, Modifier.weight(2f).fillMaxHeight()) }
                key(y) { Wheel(12, m - 1, 4f, { monthNames(Store.lang)[it] }, { m = it + 1 }, Modifier.weight(4f).fillMaxHeight()) }
                Wheel(121, ny - y, 3f, { "${ny - it}" }, { y = ny - it }, Modifier.weight(3f).fillMaxHeight())
            }
        }
        Spacer(Modifier.height(14.dp))
        PBtn(Store.t("done"), { done(Triple(y, m, d)) })
    }
}

val audiences = listOf("public", "followers", "following", "both", "friend", "best", "partner", "family", "relations")
val profileAud = audiences + "me"
val uploadAud = audiences + "accounts"
val filterAud = audiences + "me"
val relKinds = listOf("friend", "best", "partner", "family")
private val lblRe = Regex("^L(\\d+)$")

/** Tambahkan nama hubungan custom milikku ke daftar pilihan audiens/filter (setelah "Semua hubungan"). */
fun withLabels(base: List<String>): List<String> {
    val ids = (Store.me?.labels?.keys ?: emptySet()).map { "L$it" }
    if (ids.isEmpty()) return base
    val i = base.indexOf("relations")
    return base.subList(0, i + 1) + ids + base.subList(i + 1, base.size)
}

fun audIcon(v: String, filter: Boolean = false): ImageVector = when {
    lblRe.matches(v) -> Icons.Outlined.Label
    filter && v == "me" -> Icons.Outlined.MoveToInbox
    else -> when (v) {
        "public" -> Icons.Rounded.Public; "followers" -> Icons.Outlined.Group; "following" -> Icons.Outlined.PersonAdd; "both" -> Icons.Outlined.People
        "friend" -> Icons.Rounded.SentimentSatisfiedAlt; "best" -> Icons.Outlined.StarOutline; "partner" -> Icons.Outlined.FavoriteBorder; "family" -> Icons.Outlined.Home
        "relations" -> Icons.Rounded.Diversity3; "accounts" -> Icons.Outlined.PersonSearch; "me" -> Icons.Outlined.Lock
        "custom" -> Icons.Outlined.Label; "newlabel" -> Icons.Outlined.AddCircleOutline; "nolabel" -> Icons.Outlined.LabelOff
        else -> Icons.Rounded.Public
    }
}
fun audLabel(v: String, filter: Boolean = false): String {
    lblRe.find(v)?.let { return Store.labelName(it.groupValues[1].toInt()) }
    return Store.t(if (filter && v == "me") "f_me" else "a_$v")
}
fun audSplit(v: String) = v.split(",").filter { it.isNotEmpty() }
fun audText(v: String, filter: Boolean = false): String {
    val l = audSplit(v)
    if (l.isEmpty()) return audLabel("public", filter)
    if (l.size <= 2) return l.joinToString(" · ") { audLabel(it, filter) }
    return "${audLabel(l.first(), filter)} +${l.size - 1}"
}

/** Isian nama hubungan sendiri (maks 100 karakter). Mengembalikan nama, atau null bila dibatalkan. */
suspend fun askLabel(initial: String = ""): String? = sheet<String> { done ->
    var c by remember { mutableStateOf(initial) }
    Column {
        HText(Store.t("lbl_title"), 18f, FontWeight.ExtraBold, modifier = Modifier.padding(start = 4.dp, bottom = 4.dp))
        HText(Store.t("lbl_note"), 13f, color = sub(), modifier = Modifier.padding(start = 4.dp, bottom = 12.dp))
        Field(Store.t("lbl_ph"), c, { c = it }, max = 100)
        Spacer(Modifier.height(8.dp))
        PBtn(Store.t("lbl_save"), if (c.trim().isEmpty()) null else ({ done(c.trim()) }), icon = Icons.Rounded.Check)
    }
}

/** Label audiens satu post (hanya ditampilkan di profil pemilik): ikon + nama pilihan. */
@Composable fun AudChip(rand: String, to: List<String> = emptyList()) {
    val l = audSplit(rand).ifEmpty { listOf("public") }
    val names = l.joinToString(" · ") { if (it == "accounts" && to.isNotEmpty()) "${audLabel(it)}: ${to.joinToString(", ") { x -> "@$x" }}" else audLabel(it) }
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(audIcon(l.first()), null, Modifier.size(14.dp), tint = sub()); Spacer(Modifier.width(5.dp))
        HText(names, 12.5f, FontWeight.SemiBold, sub(), maxLines = 2)
    }
}

/** Pilih lebih dari satu audiens (centang). Untuk pengaturan/post, "Publik" dan "Hanya saya" berdiri sendiri; untuk filter semua boleh digabung. */
suspend fun multiSheet(title: String, opts: List<String>, value: String, filter: Boolean = false): String? = sheet<String> { done ->
    var sel by remember { mutableStateOf(audSplit(value).filter { it in opts }.ifEmpty { listOf(opts.first()) }) }
    fun toggle(v: String) {
        if (v in sel) { if (sel.size > 1) sel = sel - v }
        else sel = if (!filter && (v == "public" || v == "me")) listOf(v) else sel.filter { filter || (it != "public" && it != "me") } + v
    }
    Column {
        HText(title, 18f, FontWeight.ExtraBold, modifier = Modifier.padding(start = 4.dp, bottom = 2.dp))
        HText(Store.t("multi_note"), 13f, color = sub(), modifier = Modifier.padding(start = 4.dp, bottom = 12.dp))
        Column(Modifier.heightIn(max = (LocalConfiguration.current.screenHeightDp * .5f).dp).verticalScroll(rememberScrollState())) {
            for (v in opts) Tap(scale = .98f, onTap = { toggle(v) }) {
                val on = v in sel
                Row(Modifier.fillMaxWidth().padding(bottom = 8.dp).background(if (on) ink().copy(alpha = .14f) else soft(), RoundedCornerShape(24.dp)).padding(horizontal = 18.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(audIcon(v, filter), null, Modifier.size(22.dp), tint = ink()); Spacer(Modifier.width(14.dp))
                    HText(audLabel(v, filter), 16f, FontWeight.SemiBold, modifier = Modifier.weight(1f))
                    Icon(if (on) Icons.Rounded.CheckCircle else Icons.Rounded.RadioButtonUnchecked, null, Modifier.size(22.dp), tint = if (on) ink() else sub())
                }
            }
        }
        Spacer(Modifier.height(8.dp))
        PBtn(Store.t("multi_done"), { done(sel.joinToString(",")) }, icon = Icons.Rounded.Check)
    }
}

/** Daftar pilihan bergulir (satu pilihan). */
suspend fun chooseSheet(title: String, opts: List<String>, value: String?, filter: Boolean = false): String? = sheet<String> { done ->
    Column {
        HText(title, 18f, FontWeight.ExtraBold, modifier = Modifier.padding(start = 4.dp, bottom = 12.dp))
        Column(Modifier.heightIn(max = (LocalConfiguration.current.screenHeightDp * .6f).dp).verticalScroll(rememberScrollState())) {
            for (v in opts) Tap(scale = .98f, onTap = { done(v) }) {
                Row(Modifier.fillMaxWidth().padding(bottom = 8.dp).background(if (v == value) ink().copy(alpha = .14f) else soft(), RoundedCornerShape(24.dp)).padding(horizontal = 18.dp, vertical = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(audIcon(v, filter), null, Modifier.size(22.dp), tint = ink()); Spacer(Modifier.width(14.dp))
                    HText(audLabel(v, filter), 16f, FontWeight.SemiBold, modifier = Modifier.weight(1f))
                    if (v == value) Icon(Icons.Rounded.Check, null, tint = ink())
                }
            }
        }
    }
}

/** Pilihan audiens buatan sendiri. */
@Composable fun Pick(label: String, value: String, opts: List<String> = audiences, on: (String) -> Unit) {
    val sc = rememberCoroutineScope()
    Column {
        HText(label, 13f, FontWeight.SemiBold, sub(), Modifier.padding(start = 6.dp, bottom = 6.dp))
        Tap(scale = .98f, onTap = { sc.launch { multiSheet(label, opts, value)?.let(on) } }) {
            Row(Modifier.fillMaxWidth().height(56.dp).background(soft(), RoundedCornerShape(28.dp)).padding(horizontal = 18.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(audIcon(audSplit(value).firstOrNull() ?: "public"), null, Modifier.size(22.dp), tint = ink()); Spacer(Modifier.width(12.dp))
                HText(audText(value), 16f, FontWeight.Medium, modifier = Modifier.weight(1f), maxLines = 1)
                Icon(Icons.Rounded.UnfoldMore, null, tint = sub())
            }
        }
    }
}

/** Lembar pelaporan: pilih alasan, laporan dikirim ke server. */
suspend fun reportSheet(audio: Int? = null, user: String? = null, comment: Int? = null) {
    val r = sheet<String> { done ->
        Column {
            HText(Store.t("report_title"), 20f, FontWeight.ExtraBold)
            Spacer(Modifier.height(8.dp))
            for (x in listOf("abuse", "sexual", "violence", "spam", "impersonate", "other"))
                Tap(onTap = { done(x) }) { Row(Modifier.fillMaxWidth().padding(vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) { HText(Store.t("r_$x"), 16f, FontWeight.SemiBold, modifier = Modifier.weight(1f)); Icon(Icons.Rounded.ChevronRight, null, tint = sub()) } }
        }
    } ?: return
    try {
        val b = JSONObject(); if (comment != null) b.put("comment", comment) else if (audio != null) b.put("audio", audio)
        if (user != null) b.put("user", user); b.put("reason", r)
        Api.req("POST", "/reports", b); toast(Store.t("report_done"))
    } catch (e: Exception) { toast(Store.err(e), true) }
}

/** Layar pembuka: mata menunduk lalu naik, gelombang halus, tulisan Hulhup terbuka huruf demi huruf (padanan Intro). */
@Composable fun Intro(content: @Composable () -> Unit) {
    var show by remember { mutableStateOf(!introDone) }
    val c = remember { Animatable(0f) }
    LaunchedEffect(Unit) { if (show) { c.animateTo(1f, tween(3400, easing = LinearEasing)); introDone = true; show = false } }
    content()
    if (show) IntroOverlay(c)
}

/** Lapisan intro: hanya bagian ini yang dikomposisi ulang tiap frame, bukan seluruh aplikasi. */
@Composable private fun IntroOverlay(c: Animatable<Float, androidx.compose.animation.core.AnimationVector1D>) {
    val t = c.value
    fun ramp(a: Float, b: Float) = ((t - a) / (b - a)).coerceIn(0f, 1f)
    val down = easeInC(ramp(.05f, .17f)); val up = easeOutBackC(ramp(.21f, .38f))
    val rise = if (t < .2f) 1 - down else up
    val read = easeInOutC(ramp(.40f, .84f)); val look = -.4f + 3.0f * read
    val blink = if (t > .88f && t < .95f) sin((t - .88f) / .07f * PI).toFloat() else 0f
    val pop = 1 + .07f * sin(PI * ramp(.21f, .45f)).toFloat()
    val fade = 1 - ramp(.95f, 1f) * ramp(.95f, 1f)
    val wave = ramp(.22f, .62f); val mc = markColors(); val fg = ink()
    Box(Modifier.fillMaxSize().alpha(fade).background(bgOf()), contentAlignment = Alignment.Center) {
        if (wave > 0 && wave < 1) androidx.compose.foundation.Canvas(Modifier.size(420.dp)) {
            for (i in 0 until 2) {
                val k = (wave * 1.3f - i * .22f).coerceIn(0f, 1f); if (k <= 0f || k >= 1f) continue
                val e = 1 - (1 - k) * (1 - k) * (1 - k)
                drawCircle(mc[0].copy(alpha = (1 - k) * .28f), (40 + e * 170).dp.toPx(), center, style = Stroke(2.4.dp.toPx()))
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            androidx.compose.foundation.Canvas(Modifier.size(96.dp, 96.dp * .5f / .72f).graphicsLayerScale(pop)) { peek(mc[0], mc[1], mc[2], MarkP(rise.coerceIn(0f, 1.06f), look, blink)) }
            val letters = listOf("H", "u", "l", "h", "u", "p")
            Row(Modifier.padding(start = 14.dp)) {
                letters.forEachIndexed { i, l ->
                    val p = easeOutCubicC((read * 6.6f - i).coerceIn(0f, 1f))
                    if (p > 0f) Box(Modifier.graphicsLayer { alpha = p; translationY = (1 - p) * 16.dp.toPx() }) { HText(l, 52f, FontWeight.Bold, fg, ls = -1.2f) }
                }
            }
        }
    }
}
var introDone = false
private fun Modifier.graphicsLayerScale(s: Float) = this.graphicsLayer { scaleX = s; scaleY = s }
private fun easeInC(x: Float) = x * x * x
private fun easeOutCubicC(x: Float) = 1 - (1 - x) * (1 - x) * (1 - x)
private fun easeInOutC(x: Float) = if (x < .5f) 4 * x * x * x else 1 - Math.pow((-2 * x + 2).toDouble(), 3.0).toFloat() / 2
private fun easeOutBackC(x: Float): Float { val c1 = 1.70158f; val c3 = c1 + 1; return 1 + c3 * Math.pow((x - 1).toDouble(), 3.0).toFloat() + c1 * Math.pow((x - 1).toDouble(), 2.0).toFloat() }
