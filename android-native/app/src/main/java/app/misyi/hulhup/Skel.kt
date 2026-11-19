package app.misyi.hulhup

import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay

/** Kerangka abu-abu per halaman (LOADING_SPEC §3): tunda 120 ms lalu fade 220 ms, kilau 1300 ms, bentuk mengikuti tata letak asli. */
@Composable fun Loader(kind: String = "post") {
    val appear by produceState(0f) { delay(120); animate(0f, 1f, animationSpec = tween(220)) { v, _ -> value = v } }
    val phase by rememberInfiniteTransition(label = "sk").animateFloat(0f, 1f, infiniteRepeatable(tween(1300, easing = LinearEasing)), label = "ph")
    val base = soft(); val hi = ink().copy(alpha = .07f)
    @Composable fun bar(w: Dp?, h: Dp, r: Dp = 6.dp, mod: Modifier = Modifier) {
        Box((if (w == null) mod.fillMaxWidth() else mod.width(w)).height(h).clip(RoundedCornerShape(r)).drawBehind {
            drawRect(base)
            val x = (phase * 2f - .5f) * size.width * 1.6f - size.width * .3f
            drawRect(Brush.linearGradient(listOf(Color.Transparent, hi, Color.Transparent), Offset(x, 0f), Offset(x + size.width * .8f, size.height * .3f)))
        })
    }
    @Composable fun dot(s: Dp) = Box(Modifier.size(s).clip(CircleShape).drawBehind {
        drawRect(base)
        val x = (phase * 2f - .5f) * size.width * 1.6f - size.width * .3f
        drawRect(Brush.linearGradient(listOf(Color.Transparent, hi, Color.Transparent), Offset(x, 0f), Offset(x + size.width * .8f, size.height * .3f)))
    })
    @Composable fun gap(h: Dp) = Spacer(Modifier.height(h))
    @Composable fun postCard() = Column(Modifier.padding(bottom = 12.dp).fillMaxWidth().background(cardC(), RoundedCornerShape(28.dp)).border(1.dp, ink().copy(alpha = .07f), RoundedCornerShape(28.dp)).padding(16.dp, 14.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) { dot(44.dp); Spacer(Modifier.width(10.dp)); Column { bar(120.dp, 13.dp); gap(7.dp); bar(80.dp, 10.dp) } }
        gap(14.dp); bar(null, 13.dp); gap(8.dp); bar(null, 13.dp, mod = Modifier.fillMaxWidth(.7f)); gap(14.dp)
        bar(null, 44.dp, 22.dp); gap(12.dp)
        Row(horizontalArrangement = Arrangement.spacedBy(18.dp)) { repeat(3) { bar(46.dp, 16.dp) } }
    }
    @Composable fun userRow(chip: Boolean = false) = Row(Modifier.padding(bottom = 10.dp).fillMaxWidth().background(soft(), RoundedCornerShape(26.dp)).padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
        dot(46.dp); Spacer(Modifier.width(12.dp)); Column(Modifier.weight(1f)) { bar(130.dp, 14.dp); gap(7.dp); bar(80.dp, 11.dp) }
        if (chip) bar(64.dp, 26.dp, 14.dp) else dot(24.dp)
    }
    Column(Modifier.fillMaxSize().padding(20.dp, 8.dp).graphicsLayer { alpha = appear }) {
        when (kind) {
            "profile" -> {
                dot(96.dp); gap(16.dp); bar(180.dp, 26.dp, 8.dp); gap(8.dp); bar(100.dp, 15.dp); gap(12.dp)
                bar(null, 14.dp); gap(6.dp); bar(null, 14.dp, mod = Modifier.fillMaxWidth(.6f)); gap(16.dp)
                Row(horizontalArrangement = Arrangement.spacedBy(22.dp)) { repeat(3) { bar(80.dp, 18.dp) } }; gap(16.dp)
                bar(null, 52.dp, 26.dp); gap(10.dp); bar(null, 48.dp, 24.dp); gap(14.dp); postCard(); postCard()
            }
            "users" -> repeat(7) { userRow() }
            "rel" -> { bar(90.dp, 13.dp, mod = Modifier.padding(start = 4.dp)); gap(10.dp); repeat(5) { userRow(chip = true) } }
            "notif" -> repeat(7) { userRow() }
            "postpage" -> {
                Row(verticalAlignment = Alignment.CenterVertically) { dot(48.dp); Spacer(Modifier.width(10.dp)); Column { bar(130.dp, 14.dp); gap(7.dp); bar(80.dp, 11.dp) } }
                gap(16.dp); repeat(3) { bar(null, 14.dp, mod = Modifier.fillMaxWidth(if (it == 2) .6f else 1f)); gap(8.dp) }
                gap(8.dp); bar(null, 52.dp, 26.dp); gap(14.dp)
                Row(horizontalArrangement = Arrangement.spacedBy(18.dp)) { repeat(3) { bar(46.dp, 16.dp) } }; gap(20.dp)
                repeat(3) { Row(Modifier.padding(bottom = 14.dp)) { dot(36.dp); Spacer(Modifier.width(10.dp)); Column { bar(100.dp, 12.dp); gap(6.dp); bar(200.dp, 12.dp) } } }
            }
            "streak" -> {
                bar(64.dp, 30.dp, 15.dp); gap(16.dp); bar(null, 40.dp, 20.dp); gap(16.dp)
                repeat(5) { Row(Modifier.fillMaxWidth().padding(bottom = 8.dp), horizontalArrangement = Arrangement.SpaceBetween) { repeat(7) { dot(40.dp) } } }
            }
            "form" -> {
                repeat(4) { bar(70.dp, 12.dp); gap(6.dp); bar(null, 52.dp, 26.dp); gap(16.dp) }
                bar(null, 52.dp, 26.dp)
            }
            "sessions" -> repeat(4) { bar(null, 68.dp, 26.dp, Modifier.padding(bottom = 10.dp)) }
            else -> repeat(3) { postCard() }
        }
    }
}
