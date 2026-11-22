package app.misyi.hulhup

import androidx.compose.animation.core.*
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.Icon
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.json.JSONObject

val PhipopGrad = Brush.linearGradient(listOf(Color(0xFFFF8A3D), Color(0xFFFF4F9A)))

/** Tag @phipop khusus (ala Meta AI di Threads): logo bulat kecil + teks "Phipop" bergradasi. */
@Composable fun PhipopChip(fs: Float) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        PhipopLogo((fs * 1.15f).dp); Spacer(Modifier.width(4.dp))
        androidx.compose.material3.Text("Phipop", style = TextStyle(brush = PhipopGrad, fontSize = fs.sp, fontWeight = FontWeight.ExtraBold, fontFamily = Outfit))
    }
}

/** Baris animasi saat Phipop menyiapkan jawaban: ikon sesuai langkah + label berdenyut. [k] hulhup|web|page|media, null = mikir. */
@Composable fun PhipopRunRow(k: String?, label: String?, size: Float = 13.5f) {
    val tr = rememberInfiniteTransition(label = "phrun")
    val a by tr.animateFloat(.45f, 1f, infiniteRepeatable(tween(800, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "pha")
    Row(Modifier.alpha(a), verticalAlignment = Alignment.CenterVertically) {
        when (k) {
            "web" -> Icon(Icons.Rounded.Language, null, Modifier.size(16.dp), tint = sub())
            "page" -> Icon(Icons.Rounded.Link, null, Modifier.size(16.dp), tint = sub())
            "media" -> Icon(Icons.Rounded.Headphones, null, Modifier.size(16.dp), tint = sub())
            else -> PhipopLogo(16.dp)
        }
        Spacer(Modifier.width(8.dp))
        HText(if (label.isNullOrBlank()) Store.t("ph_mikir") else label, size, FontWeight.SemiBold, sub(), maxLines = 2)
    }
}

/** Dari penanda komentar "run:<k>|<label>" atau "run:mikir". */
@Composable fun PhipopRunFromPh(ph: String) {
    val b = ph.removePrefix("run:")
    if (b.contains('|')) PhipopRunRow(b.substringBefore('|').ifEmpty { null }, b.substringAfter('|')) else PhipopRunRow(null, null)
}

// ───────── kutipan post di penulis (post baru & komentar) ─────────
/** URL post Hulhup di teks diambil keluar: teks dikembalikan tanpa URL, URL-nya disimpan lewat [set] untuk kartu kutipan. */
fun absorbQuote(t: String, set: (String) -> Unit): String {
    val r = quoteRef(t) ?: return t
    set(t.substring(r.at, r.at + r.len))
    val a = t.substring(0, r.at).trimEnd(); val b = t.substring(r.at + r.len).trimStart()
    return if (a.isEmpty()) b else if (b.isEmpty()) a else "$a $b"
}
/** Saat kirim, URL kutipan disisipkan lagi di akhir teks supaya server tetap menyimpannya sebagai URL. */
fun withQuote(t: String, q: String?): String = if (q == null) t else if (t.isBlank()) q else "${t.trim()}\n$q"

@Composable fun QuoteSlot(url: String, onClear: () -> Unit) {
    val r = quoteRef(url) ?: return
    Box(Modifier.fillMaxWidth()) {
        QuoteCard(r.id)
        Tap(Modifier.align(Alignment.TopEnd).padding(top = 16.dp, end = 14.dp), onTap = onClear) {
            Box(Modifier.size(26.dp).background(Color.Black.copy(alpha = .6f), androidx.compose.foundation.shape.CircleShape), contentAlignment = Alignment.Center) { Icon(Icons.Rounded.Close, null, Modifier.size(16.dp), tint = Color.White) }
        }
    }
}

/** Teks tanpa URL yang sudah menjadi kartu. */
fun textWithout(text: String, urls: List<String>): String {
    var t = text
    for (u in urls) if (u.isNotEmpty()) t = t.replace(u, "")
    return t.replace(Regex("[ \\t]+\\n"), "\n").replace(Regex("\\n{3,}"), "\n\n").trim()
}

/** Kartu di bawah gelembung/komentar: kutipan untuk URL post Hulhup, pratinjau/pemutar untuk URL lain. */
@Composable fun LinkCards(urls: List<String>) {
    if (urls.isEmpty()) return
    val quotes = urls.mapNotNull { quoteRef(it) }.distinctBy { it.id }
    quotes.forEach { QuoteCard(it.id) }
    val others = urls.filter { quoteRef(it) == null }
    if (others.isNotEmpty()) MediaStrip(others)
}
