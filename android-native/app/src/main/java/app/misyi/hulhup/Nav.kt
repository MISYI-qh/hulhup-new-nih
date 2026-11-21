package app.misyi.hulhup

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Search
import androidx.activity.compose.BackHandler
import androidx.compose.animation.*
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.*
import androidx.compose.runtime.snapshots.SnapshotStateList
import androidx.compose.ui.Modifier

/** Satu halaman di tumpukan. [path] = alamat halaman (sama dengan routes.dart), dipakai untuk tautan dalam. */
class Screen(val path: String, val content: @Composable () -> Unit)

/** Navigasi: tumpukan halaman, Beranda di dasar (padanan Navigator di routes.dart). */
object Nav {
    val stack: SnapshotStateList<Screen> = mutableStateListOf()
    fun go(s: Screen) { stack.add(s) }
    fun back() { if (stack.size > 1) stack.removeAt(stack.size - 1) }
    fun reset(vararg s: Screen) { stack.clear(); stack.addAll(s) }
    /** Tutup halaman tertentu (dipakai bila halaman menutup dirinya sendiri). */
    fun pop(s: Screen) { stack.remove(s) }
    /** Ganti halaman teratas (padanan pushReplacement). */
    fun replace(s: Screen) { if (stack.isEmpty()) stack.add(s) else stack[stack.size - 1] = s }
}

fun go(path: String) { Nav.go(pageFor(path) ?: Screen(path) { NotFoundPage() }) }

/** Halaman dari alamat (padanan pageFor di routes.dart). Alamat profil: /@nama atau /u/nama; post: kode pendek /p/xxxxxxx atau id angka. */
fun pageFor(name: String): Screen? {
    val path = name.substringBefore('?').substringBefore('#')
    val seg = path.split('/').filter { it.isNotEmpty() }.map { java.net.URLDecoder.decode(it, "UTF-8") }
    if (seg.isEmpty() || seg[0] == "acak") return Screen("/") { HomePage(0) }
    val s = Store
    if (seg[0].startsWith("@") && seg[0].length > 1) {
        val u = seg[0].substring(1).lowercase()
        if (seg.size == 1) return profileScreen(u, 0)
        // /@nama/followers, /following, /relations, /hups, /acak → jalur yang sama dengan /u/nama/...
        return pageFor("/u/" + u + "/" + seg.drop(1).joinToString("/"))
    }
    return when (seg[0]) {
        "hups" -> Screen("/hups") { HomePage(1) }
        "p" -> { val id = seg.getOrNull(1)?.let { it.toIntOrNull() ?: PostCode.dec(it)?.toInt() } ?: return null
            val c = if (seg.size > 3 && seg[2] == "c") seg[3].toIntOrNull() else null
            Screen(if (c == null) "/p/${PostCode.enc(id.toLong())}" else "/p/${PostCode.enc(id.toLong())}/c/$c") { PostPage(id, comment = c) } }
        "u" -> { if (seg.size == 1) return null
            when {
                seg.size == 2 || seg[2] == "acak" -> profileScreen(seg[1], 0)
                seg[2] == "relations" -> Screen("/@${seg[1]}/relations") { RelationsPage(seg[1]) }
                seg[2] == "hups" -> profileScreen(seg[1], 1)
                else -> Screen("/@${seg[1]}/${seg[2]}") { FollowsPage(seg[1], seg[2]) }
            } }
        "me" -> { val t = if (seg.size > 1) listOf("", "hups", "sorot", "saved").indexOf(seg[1]) else 0; profileScreen(s.me?.username, if (t < 0) 0 else t) }
        "notifications" -> Screen("/notifications") { NotifPage() }
        "settings" -> when {
            seg.getOrNull(1) == "profile" -> Screen("/settings/profile") { EditProfilePage() }
            seg.getOrNull(1) == "sessions" -> Screen("/settings/sessions") { SessionsPage() }
            seg.getOrNull(1) == "password" -> Screen("/settings/password") { PwPage() }
            seg.getOrNull(1) in listOf("account", "notifications", "language", "appearance", "security") -> Screen("/settings/${seg[1]}") { SettingsPage(seg[1]) }
            else -> Screen("/settings") { SettingsPage(null) }
        }
        "search" -> Screen("/search") { SearchPage() }
        "streak" -> Screen("/streak") { StreakPage() }
        "offline" -> Screen("/offline") { OfflinePage() }
        "phipop" -> if (seg.getOrNull(1) == "admin") Screen("/phipop/admin") { PhipopAdminPage() } else Screen("/phipop") { PhipopPage(Regex("[?&]code=([^&#]+)").find(name)?.groupValues?.get(1)?.let { java.net.URLDecoder.decode(it, "UTF-8") }) }
        "new" -> Screen("/new") { ComposePage() }
        "login" -> Screen("/login") { AuthPage() }
        "recover" -> Screen("/recover") { RecoverPage() }
        "faq" -> Screen("/faq") { FaqPage() }
        "sent" -> Screen(if (seg.size > 1) "/sent/${seg[1]}" else "/sent") { SentPage(seg.getOrNull(1)) }
        "about" -> Screen("/about") { TextPage(s.t("about"), s.t("about_t")) }
        "policy" -> Screen("/policy") { TextPage(s.t("policy"), s.t("policy_t")) }
        "privacy" -> Screen("/privacy") { TextPage(s.t("privacy"), s.t("privacy_t")) }
        else -> null
    }
}

fun profileScreen(u: String?, tab: Int) = Screen(if (u == null) "/me" else "/@$u") { ProfilePage(u, tab) }

/** Alamat yang dibagikan untuk profil dan post (sama dengan web). */
fun profileLink(u: String) = "https://hulhup.my.id/@$u"
fun postLink(id: Int) = "https://hulhup.my.id/p/${PostCode.enc(id.toLong())}"
fun commentLink(post: Int, c: Int) = "https://hulhup.my.id/p/${PostCode.enc(post.toLong())}/c/$c"

@androidx.compose.runtime.Composable
fun NotFoundPage() = androidx.compose.foundation.layout.Column {
    TopBar(back = true, title = "Hulhup")
    Empty(Icons.Rounded.Search, Store.t("not_found"))
}

/** Tumpukan halaman dengan transisi pudar + geser halus 220 ms (padanan route() di ui.dart). */
@androidx.compose.runtime.Composable
fun NavHost() {
    val st = Nav.stack
    BackHandler(enabled = st.size > 1) { Nav.back() }
    val top = st.lastOrNull() ?: return
    AnimatedContent(top, transitionSpec = {
        val fwd = Nav.stack.size >= (initialState.let { Nav.stack.indexOf(it) } + 1)
        (fadeIn(tween(220, easing = FastOutSlowInEasing)) + slideInHorizontally(tween(220, easing = FastOutSlowInEasing)) { if (fwd) (it * .06f).toInt() else -(it * .06f).toInt() }) togetherWith
            fadeOut(tween(140, easing = FastOutSlowInEasing))
    }, label = "nav") { s -> Box(Modifier.fillMaxSize().background(bgOf())) { s.content() } }
}
