package app.misyi.hulhup

import androidx.compose.animation.core.*
import androidx.compose.foundation.border
import androidx.compose.foundation.*
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.drawscope.scale as dscale
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.focus.onFocusChanged
import coil.compose.AsyncImage
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.delay
import kotlin.math.*

val Brand = Color(0xFF5B47F5)
val BrandDeep = Color(0xFF4330D0)
val Blue = Color(0xFF3897F0)
val Cream = Color(0xFFFBF6E9)
val Heart = Color(0xFFE0524A)
val Outfit = FontFamily(Font(R.font.outfit_regular, FontWeight.Normal), Font(R.font.outfit_bold, FontWeight.Bold), Font(R.font.outfit_bold, FontWeight.SemiBold), Font(R.font.outfit_bold, FontWeight.ExtraBold), Font(R.font.outfit_bold, FontWeight.W700), Font(R.font.outfit_regular, FontWeight.Medium))

val LocalDark = compositionLocalOf { false }
@Composable fun isDark() = LocalDark.current
@Composable fun ink() = if (isDark()) Color(0xFFF2F2F2) else Color(0xFF111111)
@Composable fun sub() = ink().copy(alpha = .6f)
@Composable fun soft() = if (isDark()) Color(0xFF1A1A1A) else Color(0xFFF4F4F4)
@Composable fun cardC() = if (isDark()) Color(0xFF141414) else Color.White
@Composable fun btnBg() = if (isDark()) Color(0xFF2E2E2E) else Color(0xFF111111)
@Composable fun bgOf() = if (isDark()) Color(0xFF0B0B0B) else Color.White
@Composable fun acc() = if (isDark()) Color(0xFF7DB4FF) else Color(0xFF2B6FDE)

@Composable fun HText(s: String, size: Float = 15f, w: FontWeight = FontWeight.Normal, color: Color = ink(), modifier: Modifier = Modifier, maxLines: Int = Int.MAX_VALUE, align: TextAlign? = null, lh: Float? = null, ls: Float? = null, overflow: TextOverflow = TextOverflow.Clip) =
    Text(s, modifier, color = color, fontSize = size.sp, fontWeight = w, maxLines = maxLines, textAlign = align, fontFamily = Outfit, lineHeight = lh?.let { (if (it > 3f) it else it * size).sp } ?: TextUnit.Unspecified, letterSpacing = ls?.sp ?: TextUnit.Unspecified, overflow = overflow)

/** Sentuhan dengan efek mengecil + getar halus (padanan Tap). */
@Composable fun Tap(modifier: Modifier = Modifier, scale: Float = .94f, onTap: (() -> Unit)?, content: @Composable () -> Unit) {
    var d by remember { mutableStateOf(false) }
    val sc by animateFloatAsState(if (d) scale else 1f, tween(130, easing = FastOutSlowInEasing), label = "tap")
    val al by animateFloatAsState(if (d) .85f else 1f, tween(130), label = "tapa")
    val hap = LocalHapticFeedback.current
    var lastTap by remember { mutableLongStateOf(0L) }
    Box(modifier.graphicsLayer { scaleX = sc; scaleY = sc; alpha = al }.pointerInput(onTap) {
        detectTapGestures(onPress = { if (onTap != null) { d = true; tryAwaitRelease(); d = false } }, onTap = { if (onTap != null) { val n = System.currentTimeMillis(); if (n - lastTap < 350) return@detectTapGestures; lastTap = n; hap.performHapticFeedback(HapticFeedbackType.TextHandleMove); onTap() } })
    }) { content() }
}

@Composable fun IconBtn(icon: ImageVector, dot: Boolean = false, color: Color? = null, onTap: () -> Unit) =
    Tap(onTap = onTap) { Box(Modifier.size(48.dp), contentAlignment = Alignment.Center) {
        Icon(icon, null, Modifier.size(24.dp), tint = color ?: ink())
        if (dot) Box(Modifier.align(Alignment.TopEnd).padding(top = 11.dp, end = 11.dp).size(9.dp).background(Heart, CircleShape).border(1.5.dp, bgOf(), CircleShape))
    } }

@Composable fun PBtn(label: String, onTap: (() -> Unit)?, icon: ImageVector? = null, loading: Boolean = false, ghost: Boolean = false, color: Color? = null, fgc: Color? = null, modifier: Modifier = Modifier) {
    val fg = fgc ?: if (ghost) ink() else if (color == null && isDark()) Color(0xFF111111) else Color.White
    val bg = if (ghost) soft() else (color ?: ink())
    Tap(modifier, onTap = if (loading) null else onTap) {
        Box(Modifier.fillMaxWidth().height(52.dp).background(if (onTap == null && !loading) bg.copy(alpha = .4f) else bg, RoundedCornerShape(26.dp)), contentAlignment = Alignment.Center) {
            if (loading) CircularProgressIndicator(Modifier.size(22.dp), color = fg, strokeWidth = 2.4.dp)
            else Row(verticalAlignment = Alignment.CenterVertically) {
                if (icon != null) Icon(icon, null, Modifier.padding(start = 14.dp).size(20.dp), tint = fg)
                HText(label, 15f, FontWeight.Bold, fg, Modifier.padding(horizontal = 14.dp), maxLines = 1)
            }
        }
    }
}

@Composable fun Field(label: String, value: String, onChange: (String) -> Unit, secret: Boolean = false, max: Int? = null, lines: Int = 1, kb: KeyboardType = KeyboardType.Text, modifier: Modifier = Modifier) {
    var hide by remember { mutableStateOf(true) }
    var focus by remember { mutableStateOf(false) }
    Column(modifier) {
        HText(label, 13f, FontWeight.SemiBold, sub(), Modifier.padding(start = 6.dp, bottom = 6.dp))
        Row(Modifier.fillMaxWidth().background(soft(), RoundedCornerShape(if (lines > 1) 24.dp else 28.dp)).border(1.5.dp, if (focus) ink() else Color.Transparent, RoundedCornerShape(if (lines > 1) 24.dp else 28.dp)).padding(start = 18.dp, end = 6.dp)) {
            BasicTextField(value, { v -> onChange(if (max != null && v.length > max) v.take(max) else v) },
                Modifier.weight(1f).padding(vertical = 16.dp).onFocusChangedCompat { focus = it },
                textStyle = TextStyle(fontSize = 16.sp, fontWeight = FontWeight.Medium, color = ink(), fontFamily = Outfit), cursorBrush = SolidColor(ink()),
                visualTransformation = if (secret && hide) PasswordVisualTransformation() else VisualTransformation.None,
                singleLine = lines == 1, minLines = lines, maxLines = if (secret) 1 else lines, keyboardOptions = KeyboardOptions(keyboardType = if (secret) KeyboardType.Password else kb))
            if (secret) IconBtn(if (hide) Icons.Rounded.VisibilityOff else Icons.Rounded.Visibility) { hide = !hide }
        }
        if (max != null) Box(Modifier.fillMaxWidth().padding(end = 8.dp, top = 4.dp), contentAlignment = Alignment.CenterEnd) { HText("${value.length}/$max", 12f, color = sub()) }
    }
}

fun Modifier.onFocusChangedCompat(f: (Boolean) -> Unit): Modifier = this.then(Modifier.onFocusChanged { f(it.isFocused) })

@Composable fun Toggle(v: Boolean, on: (Boolean) -> Unit) = Tap(onTap = { on(!v) }) {
    val al by animateFloatAsState(if (v) 1f else 0f, tween(260, easing = FastOutSlowInEasing), label = "tg")
    Box(Modifier.width(54.dp).height(32.dp).background(if (v) ink() else ink().copy(alpha = .18f), RoundedCornerShape(16.dp)).padding(3.dp)) {
        Box(Modifier.offset(x = (22 * al).dp).size(26.dp).background(bgOf(), CircleShape))
    }
}

@Composable fun <T> Seg(items: List<Pair<T, String>>, value: T, on: (T) -> Unit) {
    val n = items.size; val i = max(0, items.indexOfFirst { it.first == value })
    BoxWithConstraints(Modifier.fillMaxWidth().height(48.dp).background(soft(), RoundedCornerShape(24.dp)).padding(4.dp)) {
        val w = maxWidth / n
        val x by animateDpAsState(w * i, tween(280, easing = FastOutSlowInEasing), label = "seg")
        Box(Modifier.offset(x = x).width(w).fillMaxHeight().background(ink(), RoundedCornerShape(20.dp)))
        Row { items.forEach { e -> Tap(Modifier.weight(1f).fillMaxHeight(), .97f, { on(e.first) }) { Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { HText(e.second, 14f, FontWeight.Bold, if (e.first == value) bgOf() else sub()) } } } }
    }
}

// ───────── Lapisan (sheet, dialog, toast) yang bisa dipanggil dari mana saja ─────────
class SheetReq(val content: @Composable (done: (Any?) -> Unit) -> Unit, val result: CompletableDeferred<Any?>)
class ConfirmReq(val title: String, val body: String, val yes: String, val danger: Boolean, val result: CompletableDeferred<Boolean>)
class ToastMsg(val id: Long, val m: String, val bad: Boolean)

object Overlay {
    val sheets = mutableStateListOf<SheetReq>()
    val confirms = mutableStateListOf<ConfirmReq>()
    val toasts = mutableStateListOf<ToastMsg>()
}

@Suppress("UNCHECKED_CAST")
suspend fun <T> sheet(content: @Composable (done: (T?) -> Unit) -> Unit): T? {
    val r = CompletableDeferred<Any?>()
    val q = SheetReq({ d -> content { v -> d(v) } }, r)
    Overlay.sheets.add(q)
    return try { r.await() as T? } finally { Overlay.sheets.remove(q) }
}
suspend fun confirm(title: String, body: String, yes: String, danger: Boolean = false): Boolean {
    val r = CompletableDeferred<Boolean>(); val q = ConfirmReq(title, body, yes, danger, r)
    Overlay.confirms.add(q)
    return try { r.await() } finally { Overlay.confirms.remove(q) }
}
fun toast(m: String, bad: Boolean = false) { Overlay.toasts.add(ToastMsg(System.nanoTime(), m, bad)) }

@Composable fun OverlayHost() {
    Overlay.sheets.toList().forEach { q ->
        androidx.compose.ui.window.Dialog(onDismissRequest = { q.result.complete(null) }, properties = androidx.compose.ui.window.DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
            Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = .38f)).pointerInput(Unit) { detectTapGestures { q.result.complete(null) } }, contentAlignment = Alignment.BottomCenter) {
                Column(Modifier.padding(12.dp).widthIn(max = 520.dp).fillMaxWidth().imePadding().navigationBarsPadding().background(cardC(), RoundedCornerShape(32.dp)).pointerInput(Unit) { detectTapGestures { } }.padding(20.dp, 10.dp, 20.dp, 22.dp)) {
                    Box(Modifier.align(Alignment.CenterHorizontally).padding(bottom = 16.dp).size(38.dp, 4.dp).background(ink().copy(alpha = .18f), RoundedCornerShape(2.dp)))
                    q.content { v -> q.result.complete(v) }
                }
            }
        }
    }
    Overlay.confirms.toList().forEach { q ->
        androidx.compose.ui.window.Dialog(onDismissRequest = { q.result.complete(false) }) {
            Column(Modifier.background(cardC(), RoundedCornerShape(32.dp)).padding(24.dp)) {
                HText(q.title, 20f, FontWeight.ExtraBold)
                Spacer(Modifier.height(10.dp))
                HText(q.body, 15f, color = sub(), lh = 1.5f)
                Spacer(Modifier.height(22.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Tap(Modifier.weight(1f), onTap = { q.result.complete(false) }) {
                        Box(Modifier.fillMaxWidth().height(52.dp).background(ink().copy(alpha = .08f), RoundedCornerShape(26.dp)), contentAlignment = Alignment.Center) { HText(Store.t("cancel"), 15f, FontWeight.ExtraBold, ink(), align = TextAlign.Center) }
                    }
                    Tap(Modifier.weight(1f), onTap = { q.result.complete(true) }) {
                        Box(Modifier.fillMaxWidth().height(52.dp).background(if (q.danger) Heart else ink(), RoundedCornerShape(26.dp)), contentAlignment = Alignment.Center) { HText(q.yes, 15f, FontWeight.ExtraBold, if (q.danger || !isDark()) Color.White else Color(0xFF111111), align = TextAlign.Center, maxLines = 1) }
                    }
                }
            }
        }
    }
    Overlay.toasts.toList().forEach { t -> key(t.id) { ToastView(t) } }
}

@Composable private fun ToastView(t: ToastMsg) {
    var show by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { show = true; delay(2600); show = false; delay(380); Overlay.toasts.remove(t) }
    val a by animateFloatAsState(if (show) 1f else 0f, tween(380), label = "toast")
    Box(Modifier.fillMaxSize().statusBarsPadding().padding(top = 14.dp, start = 20.dp, end = 20.dp).graphicsLayer { alpha = a }, contentAlignment = Alignment.TopCenter) {
        Row(Modifier.graphicsLayer { translationY = (a - 1) * 60.dp.toPx() }.background(if (t.bad) Color(0xFF7A2A25) else Color(0xFF1F1F1F), RoundedCornerShape(26.dp)).padding(horizontal = 18.dp, vertical = 13.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(if (t.bad) Icons.Rounded.ErrorOutline else Icons.Rounded.CheckCircleOutline, null, Modifier.size(20.dp), tint = Cream)
            Spacer(Modifier.width(10.dp))
            HText(t.m, 14f, FontWeight.SemiBold, Cream)
        }
    }
}

// ───────── Logo ─────────
class MarkP(val rise: Float = 1f, val look: Float = .3f, val blink: Float = 0f, val lookY: Float = 0f, val cross: Float = 0f, val winkL: Float = 0f, val winkR: Float = 0f, val sep: Float = 0f, val eyeSc: Float = 1f, val pupSc: Float = 1f, val wallDy: Float = 0f, val wallSx: Float = 1f)

/** Dua mata yang mengintip dari balik dinding (padanan _PeekPainter). */
fun DrawScope.peek(eye: Color, pupil: Color, wall: Color, p: MarkP = MarkP()) {
    val u = size.width / .72f; val cx = size.width / 2; val cy = size.height / 2
    fun o(x: Float, y: Float) = Offset(cx + x * u, cy + y * u)
    val lift = (1 - p.rise) * .30f
    clipRect(-1e5f, -1e5f, 1e5f, o(0f, .21f + p.wallDy).y) {
        for (k in listOf(-1, 1)) {
            val bl = (p.blink + (if (k < 0) p.winkL else p.winkR)).coerceIn(0f, 1f)
            val ec = o(k * (.15f + p.sep), -.06f + lift)
            val ew = .25f * u * p.eyeSc; val eh = .30f * u * p.eyeSc * (1 - .92f * bl)
            drawOval(eye, Offset(ec.x - ew / 2, ec.y - eh / 2), Size(ew, eh))
            val pr = .055f * u * p.pupSc; val lx = p.look + (if (k < 0) p.cross else -p.cross)
            val pc = ec + Offset((.022f + lx * .03f) * u, (-.035f * (1 - bl) + p.lookY * .03f) * u)
            val ph = pr * 2 * (1 - .9f * bl)
            drawOval(pupil, Offset(pc.x - pr, pc.y - ph / 2), Size(pr * 2, ph))
        }
    }
    val l = o(-.36f * p.wallSx, 0f).x; val t = o(0f, p.wallDy).y; val r = o(.36f * p.wallSx, 0f).x; val b = o(0f, .21f + p.wallDy).y
    drawRoundRect(wall, Offset(l, t), Size(r - l, b - t), CornerRadius(.07f * u))
}

@Composable fun markColors(): List<Color> = if (isDark()) listOf(Color.White, Brand, Brand) else listOf(Brand, Color.White, BrandDeep)

@Composable fun Logo(width: Dp) = Canvas(Modifier.size(width, width * .5f / .72f)) { peek(Color.White, Brand, BrandDeep) }
@Composable fun LogoMark(width: Dp) { val m = markColors(); Canvas(Modifier.size(width, width * .5f / .72f)) { peek(m[0], m[1], m[2]) } }
@Composable fun LogoTile(size: Dp) = Box(Modifier.size(size).background(Brand, RoundedCornerShape(size * .225f)), contentAlignment = Alignment.Center) { Logo(size * .6f) }

class M { var rise = 1f; var look = .3f; var lookY = 0f; var cross = 0f; var blink = 0f; var winkL = 0f; var winkR = 0f; var sep = 0f; var eyeSc = 1f; var pupSc = 1f; var wallDy = 0f; var wallSx = 1f; var dx = 0f; var dy = 0f; var sc = 1f; var rot = 0f }
const val kMarkAnims = 50

private fun easeOutBack(x: Float): Float { val c1 = 1.70158f; val c3 = c1 + 1; return 1 + c3 * (x - 1).pow(3) + c1 * (x - 1).pow(2) }
private fun easeInOut(x: Float) = if (x < .5f) 2 * x * x else 1 - (-2 * x + 2).pow(2) / 2
private fun easeIn(x: Float) = x * x
private fun easeInCubic(x: Float) = x * x * x
private fun easeOutCubic(x: Float) = 1 - (1 - x).pow(3)
private fun easeInOutCubic(x: Float) = if (x < .5f) 4 * x * x * x else 1 - (-2 * x + 2).pow(3) / 2

/** 50 animasi logo (padanan markMotion di ui.dart). [v] 0..49, [t] 0..1. */
fun markMotion(v: Int, t: Float): M {
    val m = M(); val pi = PI.toFloat(); val tau = 2 * pi
    fun r(a: Float, b: Float) = ((t - a) / (b - a)).coerceIn(0f, 1f)
    fun bp(a: Float, b: Float) = sin(pi * r(a, b))
    val s1 = sin(tau * t); val c1 = cos(tau * t); val ab = abs(sin(tau * t)); val fade = 1 - t
    fun cl(x: Float) = x.coerceIn(-1f, 1f)
    when (v % kMarkAnims) {
        0 -> m.rise = 1 - bp(.05f, .95f)
        1 -> m.blink = max(bp(.1f, .3f), bp(.4f, .6f))
        2 -> m.look = .3f + 2.6f * s1
        3 -> m.dy = -16 * bp(0f, 1f)
        4 -> m.rot = easeInOut(t) * tau
        5 -> { m.sc = 1 + .22f * ab * fade; m.dy = 4 * ab }
        6 -> m.rot = .28f * sin(3 * tau * t) * fade
        7 -> { m.sc = 1 + .3f * bp(0f, 1f); m.blink = bp(.55f, .75f) }
        8 -> { m.rise = 1 - .85f * ab; m.look = .3f + 1.5f * s1 }
        9 -> { m.dx = 9 * sin(4 * tau * t) * fade; m.look = .3f + 2 * sin(4 * tau * t) }
        10 -> m.rise = 1 + .12f * bp(.2f, .7f)
        11 -> m.blink = max(bp(.05f, .2f), max(bp(.3f, .45f), bp(.55f, .7f)))
        12 -> m.lookY = 2.2f * s1
        13 -> { m.look = .3f + 2 * c1 - 2; m.lookY = 2 * s1 }
        14 -> m.cross = 2.6f * bp(.1f, .9f)
        15 -> m.sep = .05f * bp(.1f, .9f)
        16 -> m.sep = -.04f * bp(.1f, .9f)
        17 -> { m.eyeSc = 1 + .3f * bp(.1f, .9f); m.pupSc = 1 + .2f * bp(.1f, .9f) }
        18 -> m.eyeSc = 1 - .3f * bp(.1f, .9f)
        19 -> m.wallDy = .04f * sin(3 * tau * t) * fade
        20 -> m.wallSx = 1 - .15f * bp(.1f, .5f) + .1f * bp(.5f, .9f)
        21 -> { m.dy = -14 * bp(0f, .6f); m.blink = bp(.6f, .8f) }
        22 -> m.dy = -12 * ab
        23 -> m.rot = pi * bp(0f, 1f)
        24 -> { m.rot = .35f * sin(2 * tau * t) * fade; m.look = .3f + 2 * sin(2 * tau * t) }
        25 -> { m.dy = 6 * abs(sin(2 * tau * t)); m.sc = 1 + .05f * abs(sin(2 * tau * t)) }
        26 -> m.dx = 3 * sin(10 * tau * t) * bp(0f, 1f)
        27 -> { m.dx = 18 * s1; m.look = .3f + 2 * c1 - 2 }
        28 -> m.sc = 1 + .35f * bp(0f, 1f)
        29 -> m.sc = 1 + .12f * (bp(.1f, .35f) + bp(.45f, .7f))
        30 -> { m.rise = 1 - bp(0f, .45f); m.blink = bp(.6f, .8f) }
        31 -> { m.blink = .9f * bp(.1f, .9f); m.rise = 1 - .2f * bp(.1f, .9f) }
        32 -> m.winkR = bp(.2f, .6f)
        33 -> m.winkL = bp(.2f, .6f)
        34 -> { m.rise = 1 - .35f * bp(.1f, .9f); m.look = .3f - 2 * bp(.1f, .9f) }
        35 -> { m.eyeSc = 1 + .35f * bp(.05f, .5f); m.pupSc = 1 - .4f * bp(.05f, .5f); m.dy = -8 * bp(0f, .3f) }
        36 -> m.pupSc = 1 + .6f * s1
        37 -> { m.look = .3f + 2.4f * cos(3 * tau * t) - 2.4f; m.lookY = 2.4f * sin(3 * tau * t); m.rot = .12f * sin(3 * tau * t) }
        38 -> m.look = .3f + 2.5f * cl(3 * s1)
        39 -> { m.rise = 1 - .4f * bp(.1f, .9f); m.look = .3f + 2.5f * cl(2 * s1); m.eyeSc = 1 - .15f * bp(.1f, .9f) }
        40 -> { m.dy = -12 * ab; m.eyeSc = 1 + .15f * ab }
        41 -> { m.sc = 1 + .25f * bp(0f, 1f); m.rise = 1 + .1f * bp(.3f, .7f); m.blink = bp(.7f, .9f) }
        42 -> { m.sc = 1 + .08f * sin(3 * tau * t) * fade; m.wallSx = 1 + .1f * sin(3 * tau * t) * fade; m.wallDy = .015f * sin(3 * tau * t) * fade }
        43 -> { m.rot = .2f * bp(.1f, .9f); m.lookY = -2 * bp(.1f, .9f) }
        44 -> m.rise = if (t < .7f) 1 - easeIn(r(0f, .12f)) else easeOutBack(r(.7f, .9f))
        45 -> m.rise = 1 - .9f * abs(sin(3 * pi * t))
        46 -> { m.eyeSc = 1 + .3f * bp(.05f, .4f); m.dx = 6 * sin(12 * tau * t) * bp(.05f, .6f) }
        47 -> { m.look = .3f + 2.2f * c1 - 2.2f; m.lookY = -2.2f * s1; m.rise = 1 + .08f * bp(.1f, .9f) }
        48 -> { m.look = .3f + 2 * cos(2 * tau * t) - 2; m.lookY = 2 * sin(2 * tau * t); m.sep = .03f * s1 }
        else -> { m.rise = 1 - bp(0f, .3f); m.dy = -14 * bp(.35f, .65f); m.sc = 1 + .1f * bp(.35f, .65f); m.blink = bp(.7f, .9f) }
    }
    return m
}

/** Logo yang hidup: memainkan 50 animasi bergantian dengan urutan acak (padanan AnimMark). */
class AnimMarkCtl { var play: ((Int?) -> Unit)? = null }

@Composable fun AnimMark(width: Dp, auto: Boolean = false, loop: Boolean = false, slow: Boolean = false, tapPlay: Boolean = false, first: Int? = null, ms: Int = 1700, colors: List<Color>? = null, ctl: AnimMarkCtl? = null) {
    val mc = colors ?: markColors()
    var v by remember { mutableIntStateOf(first ?: (0 until kMarkAnims).random()) }
    var last by remember { mutableIntStateOf(-1) }
    val prog = remember { Animatable(0f) }
    var kick by remember { mutableIntStateOf(0) }
    var started by remember { mutableStateOf(false) }
    fun play(n: Int? = null) {
        var x = n ?: (0 until kMarkAnims).random()
        if (n == null && x == last) x = (x + 1 + (0 until kMarkAnims - 1).random()) % kMarkAnims
        v = x; last = x; kick++
    }
    ctl?.play = { n -> play(n) }
    LaunchedEffect(auto) {
        if (auto) { delay(if (loop) 0L else 500L); last = v; kick++ }
    }
    LaunchedEffect(kick) {
        if (kick == 0) return@LaunchedEffect
        prog.snapTo(0f); prog.animateTo(1f, tween(ms, easing = LinearEasing))
        if (auto) { if (loop) play() else { delay(if (slow) 5000L + (0..7000).random() else 700L + (0..1300).random()); play() } }
    }
    val w = width
    // Gerak dihitung di fase gambar/layer (bukan komposisi) supaya mulus 60 fps tanpa komposisi ulang tiap frame.
    val mod = Modifier.size(w, w * .5f / .72f).graphicsLayer {
        val m = markMotion(v, prog.value)
        translationX = w.toPx() * (m.dx / 100f); translationY = w.toPx() * (m.dy / 100f)
        rotationZ = Math.toDegrees(m.rot.toDouble()).toFloat(); scaleX = m.sc; scaleY = m.sc
    }.let { if (tapPlay) it.pointerInput(Unit) { detectTapGestures { play() } } else it }
    Canvas(mod) { val m = markMotion(v, prog.value); peek(mc[0], mc[1], mc[2], MarkP(m.rise.coerceIn(0f, 1.1f), m.look, m.blink.coerceIn(0f, 1f), m.lookY, m.cross, m.winkL.coerceIn(0f, 1f), m.winkR.coerceIn(0f, 1f), m.sep, m.eyeSc, m.pupSc, m.wallDy, m.wallSx)) }
}

@Composable fun LogoLoop(size: Dp = 44.dp) = AnimMark(size, auto = true, loop = true, first = 0, ms = 1500)
@Composable fun HBrand(onTap: (() -> Unit)? = null) {
    val w: @Composable () -> Unit = {
        Row(verticalAlignment = Alignment.CenterVertically) {
            AnimMark(40.dp, auto = true, slow = true, tapPlay = true)
            Spacer(Modifier.width(10.dp))
            HText("Hulhup", 21f, FontWeight.ExtraBold, ink(), ls = -.4f)
            if (onTap != null) Icon(Icons.Rounded.KeyboardArrowDown, null, Modifier.size(22.dp), tint = sub())
        }
    }
    if (onTap == null) w() else Tap(scale = .96f, onTap = onTap) { Box(Modifier.padding(vertical = 8.dp, horizontal = 6.dp)) { w() } }
}

@Composable fun TopBar(lead: (@Composable () -> Unit)? = null, center: (@Composable () -> Unit)? = null, title: String? = null, back: Boolean = false, actions: @Composable RowScope.() -> Unit = {}, nActions: Int = 1, leadDp: Int? = null, actDp: Int? = null) {
    val w = (48 * max(1, nActions)).dp; val wl = leadDp?.dp ?: w; val wa = actDp?.dp ?: w
    Row(Modifier.fillMaxWidth().statusBarsPadding().height(60.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.width(wl), contentAlignment = Alignment.CenterStart) { if (back) IconBtn(Icons.Rounded.ArrowBackIosNew) { Nav.back() } else lead?.invoke() }
        Box(Modifier.weight(1f), contentAlignment = Alignment.Center) { if (center != null) center() else HText(title ?: "", 18f, FontWeight.ExtraBold) }
        Row(Modifier.width(wa), horizontalArrangement = Arrangement.End, content = actions)
    }
}

@Composable fun Img(url: String?, modifier: Modifier = Modifier, fit: ContentScale = ContentScale.Crop) {
    if (url == null) return
    val net = if (url.startsWith("/")) Api.base + url else url
    AsyncImage(model = net, contentDescription = null, modifier = modifier, contentScale = fit)
}

/** Foto resmi akun hulhup/misyi/phipop (PNG transparan): latarnya mengikuti tema. */
fun officialAvatar(url: String?) = url != null && Regex("/users/(phipop|misyi|hulhup)/avatar").containsMatchIn(url)
fun officialUser(u: String?) = u == "phipop" || u == "misyi" || u == "hulhup"

@Composable fun Avatar(url: String?, name: String, size: Dp) {
    Box(Modifier.size(size).clip(CircleShape), contentAlignment = Alignment.Center) {
        Box(Modifier.fillMaxSize().background(if (officialAvatar(url)) bgOf() else Color(0xFF2B2B2B)), contentAlignment = Alignment.Center) { HText(if (name.isEmpty()) "?" else name.take(1).uppercase(), size.value * .42f, FontWeight.ExtraBold, Cream) }
        if (url != null) Img(url, Modifier.fillMaxSize())
    }
}

/** Masuk dengan geser+pudar bertahap (padanan In). */
@Composable fun In(i: Int, content: @Composable () -> Unit) {
    val a = remember { Animatable(0f) }
    LaunchedEffect(Unit) { a.animateTo(1f, tween(240 + min(i, 6) * 40, easing = FastOutSlowInEasing)) }
    Box(Modifier.graphicsLayer { alpha = a.value; translationY = (1f - a.value) * 14.dp.toPx() }) { content() }
}

@Composable fun Empty(icon: ImageVector?, text: String, action: (@Composable () -> Unit)? = null, custom: (@Composable () -> Unit)? = null) = In(0) {
    Box(Modifier.fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Box(Modifier.size(72.dp).background(soft(), CircleShape), contentAlignment = Alignment.Center) { if (custom != null) custom() else if (icon != null) Icon(icon, null, Modifier.size(30.dp), tint = sub()) }
            Spacer(Modifier.height(14.dp))
            HText(text, 15f, color = sub(), align = TextAlign.Center, lh = 1.4f)
            if (action != null) { Spacer(Modifier.height(16.dp)); action() }
        }
    }
}

enum class HK { sorot, comment, hups, acak, save, share, add }

/** Ikon buatan sendiri, garis tipis berujung bulat (padanan _HPainter). */
@Composable fun HIcon(k: HK, filled: Boolean = false, size: Dp = 24.dp, color: Color, burst: Float = 1f) {
    Canvas(Modifier.size(size)) {
        dscale(this.size.width / 24f, pivot = Offset.Zero) {
            val st = Stroke(1.7f, cap = StrokeCap.Round, join = StrokeJoin.Round)
            fun line(a: Offset, b: Offset, s: Stroke = st) = drawLine(color, a, b, s.width, StrokeCap.Round)
            when (k) {
                HK.sorot -> {
                    val beam = Path().apply { moveTo(8.9f, 15.8f); lineTo(15.1f, 15.8f); lineTo(19.2f, 7.4f); lineTo(4.8f, 7.4f); close() }
                    val hp = Offset(8.2f, 17.6f); val hs = Size(7.6f, 4.6f); val hr = CornerRadius(1.8f)
                    if (filled) {
                        drawRoundRect(color, hp, hs, hr); drawPath(beam, color)
                        val t = burst.coerceIn(0f, 1f)
                        fun r(a: Offset, b: Offset) = drawLine(color, a, Offset(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t), 1.6f, StrokeCap.Round)
                        r(Offset(12f, 5.6f), Offset(12f, 1.6f)); r(Offset(6.6f, 5.4f), Offset(3.4f, 2.2f)); r(Offset(17.4f, 5.4f), Offset(20.6f, 2.2f))
                    } else { drawRoundRect(color, hp, hs, hr, style = st); drawPath(beam, color, style = st) }
                }
                HK.save -> {
                    val bm = Path().apply {
                        moveTo(7.5f, 3.6f); lineTo(16.5f, 3.6f); arcTo(Rect(15f, 3.6f, 18f, 6.6f), -90f, 90f, false); lineTo(18f, 20.4f); lineTo(12f, 16.2f); lineTo(6f, 20.4f); lineTo(6f, 5.1f)
                        arcTo(Rect(6f, 3.6f, 9f, 6.6f), 180f, 90f, false); close()
                    }
                    if (filled) drawPath(bm, color) else drawPath(bm, color, style = st)
                }
                HK.comment -> {
                    val b = Path().apply {
                        moveTo(6.5f, 4f); lineTo(17.5f, 4f); arcTo(Rect(14f, 4f, 21f, 11f), -90f, 90f, false); lineTo(21f, 13f); arcTo(Rect(14f, 9.5f, 21f, 16.5f), 0f, 90f, false)
                        lineTo(12.4f, 16.5f); lineTo(8f, 20.4f); lineTo(8f, 16.5f); lineTo(6.5f, 16.5f); arcTo(Rect(3f, 9.5f, 10f, 16.5f), 90f, 90f, false); lineTo(3f, 7.5f)
                        arcTo(Rect(3f, 4f, 10f, 11f), 180f, 90f, false); close()
                    }
                    drawPath(b, color, style = st); line(Offset(8f, 9f), Offset(16f, 9f)); line(Offset(8f, 12.2f), Offset(13f, 12.2f))
                }
                HK.hups -> {
                    drawCircle(color, 2.4f, Offset(5.6f, 6f), style = st); drawCircle(color, 2.4f, Offset(5.6f, 17.4f), style = st)
                    line(Offset(5.6f, 8.4f), Offset(5.6f, 15f)); line(Offset(10.6f, 5f), Offset(20f, 5f)); line(Offset(10.6f, 8.4f), Offset(16.4f, 8.4f))
                    line(Offset(10.6f, 16.4f), Offset(20f, 16.4f)); line(Offset(10.6f, 19.8f), Offset(15.4f, 19.8f))
                }
                HK.acak -> {
                    drawPath(Path().apply { moveTo(3f, 7.5f); lineTo(6.4f, 7.5f); cubicTo(10.4f, 7.5f, 11.4f, 16.5f, 15.4f, 16.5f); lineTo(19.4f, 16.5f) }, color, style = st)
                    drawPath(Path().apply { moveTo(3f, 16.5f); lineTo(6.4f, 16.5f); cubicTo(10.4f, 16.5f, 11.4f, 7.5f, 15.4f, 7.5f); lineTo(19.4f, 7.5f) }, color, style = st)
                    drawPath(Path().apply { moveTo(17.2f, 14.3f); lineTo(19.4f, 16.5f); lineTo(17.2f, 18.7f) }, color, style = st)
                    drawPath(Path().apply { moveTo(17.2f, 5.3f); lineTo(19.4f, 7.5f); lineTo(17.2f, 9.7f) }, color, style = st)
                }
                HK.share -> {
                    drawPath(Path().apply { moveTo(5f, 12.5f); lineTo(5f, 18f); arcTo(Rect(3f, 16f, 7f, 20f), 180f, -90f, false); lineTo(17f, 20f); arcTo(Rect(15f, 16f, 19f, 20f), 90f, -90f, false); lineTo(19f, 12.5f) }, color, style = st)
                    line(Offset(12f, 15f), Offset(12f, 4f)); drawPath(Path().apply { moveTo(8f, 8f); lineTo(12f, 4f); lineTo(16f, 8f) }, color, style = st)
                }
                HK.add -> { line(Offset(12f, 5f), Offset(12f, 19f)); line(Offset(5f, 12f), Offset(19f, 12f)) }
            }
        }
    }
}

@Composable fun ActBtn(k: HK, on: Boolean = false, count: Int? = null, onTap: () -> Unit) {
    val c = if (on) (if (k == HK.sorot) ink() else acc()) else sub()
    val v = remember(on) { Animatable(if (on) 0f else 1f) }
    LaunchedEffect(on) { if (on) v.animateTo(1f, tween(520, easing = FastOutSlowInEasing)) }
    Tap(onTap = onTap) {
        Row(Modifier.padding(horizontal = 8.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            val sc = if (on) .78f + .22f * elastic(v.value) else 1f
            Box(Modifier.scale(sc)) { HIcon(k, on, 23.dp, c, v.value) }
            if (count != null) { Spacer(Modifier.width(6.dp)); HText(Store.fmt(count), 13.5f, FontWeight.Bold, c) }
        }
    }
}
private fun elastic(t: Float): Float { if (t <= 0f) return 0f; if (t >= 1f) return 1f; val p = .4f; return (2.0.pow(-10.0 * t) * sin((t - p / 4) * (2 * PI) / p) + 1).toFloat() }

@Composable fun LikeBtn(liked: Boolean, count: Int, onTap: () -> Unit) = ActBtn(HK.sorot, liked, count, onTap)

/** Latar profil: penuh lebar, memudar halus ke warna halaman di semua sisi (padanan CoverBox). */
@Composable fun CoverBox(url: String?, h: Dp, over: (@Composable BoxScope.() -> Unit)? = null) {
    val bg = bgOf()
    Box(Modifier.fillMaxWidth().height(h)) {
        if (url == null) Box(Modifier.fillMaxSize().background(Brush.linearGradient(listOf(Color(0xFF163F2B), Color(0xFF2F6048), Color(0xFF5B9A7A)))).drawBehind {
            drawCircle(Brush.radialGradient(listOf(Color.White.copy(alpha = .16f), Color.Transparent), center = Offset(size.width * .95f, size.height * .2f), radius = 120.dp.toPx()), 120.dp.toPx(), Offset(size.width * .95f, size.height * .2f))
        })
        else Img(url, Modifier.fillMaxSize())
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(0f to bg.copy(alpha = .9f), .22f to bg.copy(alpha = 0f), .5f to bg.copy(alpha = 0f), .86f to bg.copy(alpha = .8f), 1f to bg)))
        over?.invoke(this)
    }
}
