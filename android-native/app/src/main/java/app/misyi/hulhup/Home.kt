package app.misyi.hulhup

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.activity.compose.BackHandler
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.pow

val kBuild get() = BuildConfig.BUILD

/** Beranda: Acak (tombol besar) dan Hups (linimasa), dengan menu samping (padanan home.dart). */
@Composable fun HomePage(mode0: Int = 0) {
    val s = Store; val sc = rememberCoroutineScope()
    var menu by remember { mutableStateOf(false) }; var busy by remember { mutableStateOf(false) }
    var mode by remember { mutableIntStateOf(if (s.online) mode0 else 0) }
    @Suppress("UNUSED_EXPRESSION") s.rev
    LaunchedEffect(mode) { s.homeMode = mode }
    BackHandler(enabled = menu || mode != 0) { if (menu) menu = false else mode = 0 }

    fun tap() {
        if (busy) return
        busy = true
        sc.launch {
            try {
                val a = s.random()
                if (a == null) { toast(s.t(if (s.fromOffline) "no_net_empty" else if (s.me != null && s.filter != "public") "nofilter" else "nobody")); return@launch }
                if (s.fromOffline) toast(s.t("no_net"))
                s.countView(a)
                if (a.url.isNotEmpty() && !(a.bgm && s.bgmMuted)) launch { try { s.play(a, force = true) } catch (_: Exception) { toast(s.t("e_server"), true) } }
                sheet<Unit> { done -> PopupBody(a) { done(null) } }
                if (s.playing == a.id) s.stop()
            } catch (e: Exception) { toast(s.err(e), true) } finally { busy = false }
        }
    }
    fun filter() = sc.launch {
        val r = multiSheet(s.t("filter_title"), withLabels(filterAud), if (s.me == null) "public" else s.filter, filter = true) ?: return@launch
        if (s.me == null && r != "public") { toast(s.t("filter_login")); return@launch }
        s.setFilter(r)
    }
    @Composable fun filterChip() {
        val f = if (s.me == null) "public" else s.filter
        Tap(onTap = { filter() }, scale = .96f) {
            Row(Modifier.background(soft(), RoundedCornerShape(22.dp)).padding(horizontal = 14.dp, vertical = 9.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(audIcon(audSplit(f).first(), true), null, Modifier.size(16.dp), tint = ink()); Spacer(Modifier.width(7.dp))
                HText(audText(f, true), 13.5f, FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, false)); Spacer(Modifier.width(2.dp))
                Icon(Icons.Rounded.KeyboardArrowDown, null, Modifier.size(18.dp), tint = sub())
            }
        }
    }

    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            TopBar(lead = { IconBtn(Icons.Rounded.Menu) { menu = true } }, center = { HBrand() }, nActions = 2, actions = {
                IconBtn(Icons.Rounded.Search) { if (s.needNet()) go("/search") }
                IconBtn(Icons.Outlined.PersonOutline, dot = s.unread > 0) { go(if (s.me == null) "/me" else "/@${s.me!!.username}") }
            })
            if (s.updateReady) Box(Modifier.padding(20.dp, 4.dp, 20.dp, 0.dp)) {
                Tap(scale = .98f, onTap = { sc.launch { showUpdate() } }) {
                    Row(Modifier.fillMaxWidth().background(soft(), RoundedCornerShape(18.dp)).padding(16.dp, 12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Rounded.SystemUpdate, null, Modifier.size(20.dp), tint = ink()); Spacer(Modifier.width(12.dp))
                        HText(s.t("upd_title"), 14f, FontWeight.Bold, modifier = Modifier.weight(1f)); HText(s.t("upd_btn"), 14f, FontWeight.ExtraBold)
                    }
                }
            }
            Box(Modifier.weight(1f).fillMaxWidth()) {
                AnimatedContent(mode, transitionSpec = { fadeIn(tween(260)) togetherWith fadeOut(tween(260)) }, label = "mode") { m ->
                    if (m == 0) Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            TapButton { tap() }
                            Spacer(Modifier.height(20.dp))
                            AnimatedContent(s.taps, transitionSpec = { (fadeIn(tween(300)) + slideInVertically(tween(300)) { (it * .3f).toInt() }) togetherWith fadeOut(tween(300)) }, label = "taps") { n ->
                                HText(s.fmt(n), 38f, FontWeight.ExtraBold, ls = -1.2f)
                            }
                            Spacer(Modifier.height(16.dp))
                            filterChip()
                        }
                    } else Column(Modifier.fillMaxSize()) {
                        Box(Modifier.padding(bottom = 8.dp).align(Alignment.CenterHorizontally)) { filterChip() }
                        val f = if (s.me == null) "public" else s.filter
                        Box(Modifier.weight(1f)) {
                            key("hf_$f${s.me?.username}") { HupsFeed(f) }
                            Box(Modifier.align(Alignment.BottomEnd).padding(end = 20.dp, bottom = 14.dp)) {
                                Tap(onTap = { if (s.needNet()) go(if (s.me == null) "/login" else "/new") }) {
                                    Box(Modifier.size(56.dp).shadow(14.dp, CircleShape, ambientColor = Color.Black, spotColor = Color.Black).background(btnBg(), CircleShape), contentAlignment = Alignment.Center) { HIcon(HK.add, size = 26.dp, color = Cream) }
                                }
                            }
                        }
                    }
                }
            }
            // pengalih Acak / Hups
            Box(Modifier.navigationBarsPadding().padding(60.dp, 6.dp, 60.dp, 12.dp)) {
                Row(Modifier.fillMaxWidth().background(soft(), RoundedCornerShape(26.dp)).padding(4.dp)) {
                    for ((i, k, label) in listOf(Triple(0, HK.acak, s.t("rand_tab")), Triple(1, HK.hups, s.t("hups")))) {
                        val on = mode == i
                        val bg by animateColorAsState(if (on) ink() else Color.Transparent, tween(260), label = "seg")
                        Tap(Modifier.weight(1f), .97f, onTap = { if (i == 1 && !s.needNet()) return@Tap; if (mode != i) mode = i }) {
                            Row(Modifier.fillMaxWidth().height(44.dp).background(bg, RoundedCornerShape(22.dp)), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                                HIcon(k, size = 19.dp, color = if (on) bgOf() else sub()); Spacer(Modifier.width(8.dp))
                                HText(label, 14f, FontWeight.ExtraBold, if (on) bgOf() else sub())
                            }
                        }
                    }
                }
            }
        }
        SideMenu(menu) { menu = false }
    }
}

@Composable fun TapButton(onTap: () -> Unit) {
    val ring = ink(); val burst = remember { Animatable(0f) }; val ctl = remember { AnimMarkCtl() }
    var down by remember { mutableStateOf(false) }; val sc = rememberCoroutineScope(); val hap = LocalHapticFeedback.current
    val scale by animateFloatAsState(if (down) .94f else 1f, tween(150), label = "s")
    val shadow by animateFloatAsState(if (down) 24f else 52f, tween(150), label = "sh")
    Box(Modifier.size(330.dp).drawBehind {
        val b = burst.value
        if (b > 0f && b < 1f) for (i in 0 until 3) {
            val k = (b * 1.4f - i * .18f).coerceIn(0f, 1f); if (k <= 0f || k >= 1f) continue
            val e = 1 - (1 - k).pow(3)
            drawCircle(ring.copy(alpha = ((1 - k) * (.34f - i * .08f)).coerceIn(0f, 1f)), (104 + e * 60).dp.toPx(), center, style = Stroke((2.2f - i * .5f).dp.toPx()))
        }
    }, contentAlignment = Alignment.Center) {
        Box(Modifier.size(204.dp).graphicsLayer { scaleX = scale; scaleY = scale }.shadow(shadow.dp, CircleShape, ambientColor = Brand, spotColor = Brand).background(Brand, CircleShape)
            .pointerInput(Unit) { detectTapGestures(onPress = { down = true; tryAwaitRelease(); down = false }, onTap = { hap.performHapticFeedback(HapticFeedbackType.LongPress); sc.launch { burst.snapTo(0f); burst.animateTo(1f, tween(1000, easing = LinearEasing)) }; ctl.play?.invoke(null); onTap() }) },
            contentAlignment = Alignment.Center) {
            AnimMark(122.dp, auto = true, ms = 1500, first = 0, colors = listOf(Color.White, Brand, BrandDeep), ctl = ctl)
        }
    }
}

@Composable fun SideMenu(open: Boolean, close: () -> Unit) {
    val s = Store; val sc = rememberCoroutineScope(); var more by remember { mutableStateOf(false) }
    val x by animateDpAsState(if (open) 0.dp else (-320).dp, tween(380, easing = FastOutSlowInEasing), label = "menu")
    val fade by animateFloatAsState(if (open) 1f else 0f, tween(300), label = "fade")
    @Suppress("UNUSED_EXPRESSION") s.rev
    @Composable fun item(i: androidx.compose.ui.graphics.vector.ImageVector, k: String, net: Boolean = false, on: () -> Unit) =
        Tap(Modifier.fillMaxWidth(), onTap = { if (net && !s.needNet()) return@Tap; close(); on() }) {
            Row(Modifier.padding(vertical = 14.dp, horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) { Icon(i, null, Modifier.size(24.dp), tint = ink()); Spacer(Modifier.width(16.dp)); HText(s.t(k), 16f, FontWeight.SemiBold) }
        }
    if (open || fade > 0f) Box(Modifier.fillMaxSize().alpha(fade).background(Color.Black.copy(alpha = .45f)).pointerInput(open) { if (open) detectTapGestures { close() } })
    Column(Modifier.graphicsLayer { translationX = x.toPx() }.width(300.dp).fillMaxHeight().shadow(20.dp, RoundedCornerShape(topEnd = 36.dp, bottomEnd = 36.dp)).background(bgOf(), RoundedCornerShape(topEnd = 36.dp, bottomEnd = 36.dp))
        .statusBarsPadding().navigationBarsPadding().padding(20.dp, 18.dp)) {
        HBrand()
        Spacer(Modifier.height(28.dp))
        Box(Modifier.padding(bottom = 8.dp)) { PBtn(s.t("create"), { if (s.needNet()) { close(); go(if (s.me == null) "/login" else "/new") } }, icon = Icons.Rounded.Add) }
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState())) {
            item(Icons.Rounded.Tune, "settings", net = true) { go("/settings") }
            if (s.me != null) item(Icons.Outlined.Send, "sent_title") { go("/sent") }
            item(Icons.Rounded.DownloadDone, "offline_t") { go("/offline") }
            Tap(Modifier.fillMaxWidth(), onTap = { close(); sc.launch { if (s.checkUpdate(true)) showUpdate() else toast(s.t("upd_none")) } }) {
                Row(Modifier.padding(vertical = 14.dp, horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Rounded.SystemUpdate, null, Modifier.size(24.dp), tint = ink()); Spacer(Modifier.width(16.dp)); HText(s.t("upd_menu"), 16f, FontWeight.SemiBold) }
            }
            Tap(Modifier.fillMaxWidth(), onTap = { more = !more }) {
                Row(Modifier.padding(vertical = 14.dp, horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Rounded.MoreHoriz, null, Modifier.size(24.dp), tint = ink()); Spacer(Modifier.width(16.dp)); HText(s.t("more"), 16f, FontWeight.SemiBold, modifier = Modifier.weight(1f))
                    val r by animateFloatAsState(if (more) 180f else 0f, tween(200), label = "r"); Icon(Icons.Rounded.ExpandMore, null, Modifier.size(24.dp).rotate(r), tint = sub())
                }
            }
            AnimatedVisibility(more, enter = expandVertically(tween(220)) + fadeIn(), exit = shrinkVertically(tween(220)) + fadeOut()) {
                Column(Modifier.padding(start = 16.dp)) {
                    item(Icons.Outlined.Info, "about") { go("/about") }
                    item(Icons.Outlined.HelpOutline, "faq") { go("/faq") }
                    item(Icons.Rounded.Rule, "policy") { go("/policy") }
                    item(Icons.Outlined.Lock, "privacy") { go("/privacy") }
                    item(Icons.Rounded.Language, "website") { Plat.openExternal("https://hulhup.my.id") }
                }
            }
        }
        if (s.me == null) PBtn(s.t("login"), { close(); go("/login") }, icon = Icons.Rounded.Login)
        else PBtn(s.t("logout"), { close(); sc.launch { s.logout() } }, icon = Icons.Rounded.Logout, ghost = true, fgc = Heart)
        Spacer(Modifier.height(14.dp))
        HText(if (kBuild > 0) "Misyi · v2.0.0 ($kBuild)" else "Misyi · v2.0.0", 12f, FontWeight.Bold, sub(), ls = 1.2f, align = TextAlign.Center, modifier = Modifier.fillMaxWidth())
    }
}

@Composable fun PopupBody(a: A, close: () -> Unit) {
    val s = Store; val sc = rememberCoroutineScope()
    @Suppress("UNUSED_EXPRESSION") s.rev
    Column {
        if (a.pprof) Tap(Modifier.fillMaxWidth(), onTap = { close(); go("/@${a.owner}") }) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Avatar(a.ownerAvatar, a.ownerName, 46.dp); Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) { HText(a.ownerName, 16f, FontWeight.ExtraBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, false)); if (a.ownerVerified) Icon(Icons.Rounded.Verified, null, Modifier.padding(start = 4.dp).size(16.dp), tint = Blue) }
                    HText(if (a.created > 0) "${a.owner} · ${s.`when`(a.created)}" else a.owner, 13f, color = sub(), maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                Icon(Icons.Rounded.ChevronRight, null, tint = sub())
            }
        }
        if (!a.pprof && a.created > 0) HText(s.`when`(a.created), 13f, color = sub(), modifier = Modifier.padding(bottom = 6.dp))
        val d = a.desc.trim()
        if (d.isNotEmpty()) Tap(Modifier.fillMaxWidth(), .99f, onTap = { close(); openPost(a) }) {
            val t = buildAnnotatedString { append(d); if (a.long) withStyle(SpanStyle(color = acc(), fontWeight = FontWeight.Bold)) { append(" …  ${s.t("read_more")}") } }
            androidx.compose.material3.Text(t, Modifier.padding(top = if (a.pprof) 12.dp else 0.dp), fontSize = 15.sp, lineHeight = 21.sp, maxLines = 6, overflow = TextOverflow.Ellipsis, color = ink(), fontFamily = Outfit)
        }
        firstUrl(d)?.let { LinkEmbed(it) }
        Spacer(Modifier.height(if (a.pprof || d.isNotEmpty()) 14.dp else 4.dp))
        if (a.url.isNotEmpty()) {
            val on = s.playing == a.id
            Row(Modifier.fillMaxWidth().background(soft(), RoundedCornerShape(26.dp)).padding(8.dp, 8.dp, 6.dp, 8.dp), verticalAlignment = Alignment.CenterVertically) {
                val bg by animateColorAsState(if (on) Brand else btnBg(), tween(250), label = "pb")
                Tap(onTap = { sc.launch { try { s.play(a) } catch (_: Exception) { toast(s.t("e_server"), true) } } }) {
                    Box(Modifier.size(44.dp).background(bg, CircleShape), contentAlignment = Alignment.Center) { Icon(if (on) Icons.Rounded.Pause else Icons.Rounded.PlayArrow, null, Modifier.size(26.dp), tint = if (on) Color.White else Cream) }
                }
                val ms = if (on) s.posMs else 0
                val total = (if (s.dur > 0) s.dur else a.secs * 1000).coerceAtLeast(1)
                val frac = rememberPlayFrac(on) { if (s.dur > 0) s.dur else total }; val bar = ink()
                Box(Modifier.weight(1f).padding(horizontal = 12.dp).height(6.dp).clip(RoundedCornerShape(4.dp)).background(ink().copy(alpha = .12f)).drawBehind { drawRect(bar, size = androidx.compose.ui.geometry.Size(size.width * frac(), size.height)) })
                HText("${mmss(ms / 1000)} / ${mmss(a.secs)}", 13f, FontWeight.Bold, if (on) ink() else sub())
            }
            Spacer(Modifier.height(10.dp)); SpeedRow()
        }
        Spacer(Modifier.height(6.dp))
        PostActions(a, onComments = { close(); openPost(a) })
        val off = s.isOffline(a.id)
        PBtn(if (off) s.t("is_offline") else s.t("mk_offline"), { sc.launch { toggleOfflinePost(a) } }, ghost = true, icon = if (off) Icons.Rounded.OfflinePin else Icons.Outlined.DownloadForOffline)
        if (s.me != null && s.me!!.username != a.owner) Tap(Modifier.fillMaxWidth(), onTap = { sc.launch { reportSheet(audio = a.id) } }) {
            Row(Modifier.fillMaxWidth().padding(top = 12.dp, bottom = 2.dp), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Outlined.Flag, null, Modifier.size(16.dp), tint = sub()); Spacer(Modifier.width(6.dp)); HText(s.t("report"), 13f, FontWeight.SemiBold, sub()) }
        }
    }
}

/** Pemilih kecepatan putar buatan sendiri. */
@Composable fun SpeedRow() {
    val s = Store; @Suppress("UNUSED_EXPRESSION") s.rev
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(Icons.Rounded.Speed, null, Modifier.size(18.dp), tint = sub()); Spacer(Modifier.width(8.dp))
        Row(Modifier.weight(1f).background(soft(), RoundedCornerShape(18.dp)).padding(3.dp)) {
            for (r in listOf(0.5f, 0.75f, 1f, 1.25f, 1.5f, 2f)) {
                val on = s.rate == r; val bg by animateColorAsState(if (on) ink() else Color.Transparent, tween(200), label = "sp")
                Tap(Modifier.weight(1f), .94f, onTap = { s.setRate(r) }) { Box(Modifier.fillMaxWidth().height(32.dp).background(bg, RoundedCornerShape(15.dp)), contentAlignment = Alignment.Center) { HText(rateText(r), 12.5f, FontWeight.ExtraBold, if (on) bgOf() else sub()) } }
            }
        }
    }
}

// ───────── Pembaruan ─────────
suspend fun showUpdate() { sheet<Unit> { done -> UpdateBody { done(null) } } }

@Composable private fun UpdateBody(close: () -> Unit) {
    val s = Store; val sc = rememberCoroutineScope()
    @Composable fun step(n: Int, k: String) = Row(Modifier.padding(bottom = 10.dp), verticalAlignment = Alignment.Top) {
        Box(Modifier.size(24.dp).background(ink(), CircleShape), contentAlignment = Alignment.Center) { HText("$n", 12f, FontWeight.ExtraBold, bgOf()) }
        Spacer(Modifier.width(12.dp)); HText(s.t(k), 14f, modifier = Modifier.padding(top = 2.dp), lh = 18.9f)
    }
    Column {
        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { Icon(Icons.Rounded.SystemUpdate, null, Modifier.size(40.dp), tint = ink()) }
        Spacer(Modifier.height(12.dp)); HText(s.t("upd_title"), 20f, FontWeight.ExtraBold, align = TextAlign.Center, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(8.dp)); HText(s.t("upd_note"), 14f, color = sub(), align = TextAlign.Center, lh = 19.6f, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(18.dp))
        step(1, "upd_s1"); step(2, "upd_s2"); step(3, "upd_s3"); step(4, "upd_s4")
        HText(s.t("upd_fail"), 12.5f, color = sub(), lh = 17.5f)
        Spacer(Modifier.height(16.dp))
        PBtn(s.t("upd_dl"), { close(); sc.launch { downloadApk(s.kApkUrl) } }, icon = Icons.Rounded.Download)
    }
}

/** Unduh APK di tampilan sendiri: progres, status, dan ulangi jika gagal. */
suspend fun downloadApk(url: String) { sheet<Unit> { done -> ApkDl(url) { done(null) } } }

@Composable private fun ApkDl(url: String, close: () -> Unit) {
    val s = Store; var p by remember { mutableFloatStateOf(0f) }; var done by remember { mutableStateOf(false) }; var failed by remember { mutableStateOf(false) }
    var run by remember { mutableIntStateOf(0) }
    LaunchedEffect(run) {
        p = 0f; done = false; failed = false
        try {
            val f = java.io.File(s.app.cacheDir, "hulhup.apk")
            Api.download(url, f) { v -> p = v }
            done = true; p = 1f; Plat.installApk(f)
        } catch (_: Exception) { failed = true }
    }
    val msg = if (failed) s.t("upd_fail") else if (done) s.t("upd_inst") else "${s.t("apk_pct")} ${(p * 100).toInt()}%"
    Column {
        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { Icon(if (failed) Icons.Rounded.ErrorOutline else if (done) Icons.Rounded.CheckCircle else Icons.Rounded.Download, null, Modifier.size(40.dp), tint = if (failed) Heart else ink()) }
        Spacer(Modifier.height(12.dp)); HText(s.t("ga_title"), 18f, FontWeight.ExtraBold, align = TextAlign.Center, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(16.dp))
        if (!failed && !done && p <= 0f) LinearProgressIndicator(Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(8.dp)), color = Brand, trackColor = soft())
        else LinearProgressIndicator(progress = { if (failed) 0f else if (done) 1f else p }, modifier = Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(8.dp)), color = Brand, trackColor = soft())
        Spacer(Modifier.height(12.dp)); HText(msg, 14f, color = if (failed) Heart else sub(), align = TextAlign.Center, lh = 19.6f, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(16.dp))
        if (failed) PBtn(s.t("retry"), { run++ }, icon = Icons.Rounded.Refresh) else if (done) PBtn(s.t("done"), close, ghost = true)
    }
}
