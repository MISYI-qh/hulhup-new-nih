package app.misyi.hulhup

import android.content.Intent
import android.graphics.Color as AColor
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.compose.foundation.LocalOverscrollConfiguration
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

/** Pintu masuk aplikasi (padanan main.dart): tema, alamat tautan, catat hari masuk saat dibuka/kembali. */
@OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
class MainActivity : ComponentActivity() {
    private var ready by mutableStateOf(false)

    override fun onCreate(b: Bundle?) {
        val splash = installSplashScreen()
        super.onCreate(b)
        // Splash sistem polos (tanpa bingkai); logo penuh tampil lewat Intro Compose yang langsung menutupi layar.
        splash.setKeepOnScreenCondition { false }
        Plat.attach(this)
        Store.init(this)
        Store.banner = { toast(it) }
        Notifier.ensureChannel(this); Notifier.permissionRequester = { Plat.askNotif() }
        enableEdgeToEdge()
        lifecycleScope.launch {
            // Status masuk benar di layar pertama, tapi tidak menahan layar pembuka bila internet mati atau lambat.
            val init = launch { Store.refresh() }
            withTimeoutOrNull(1200) { init.join() }
            Nav.reset(*initial(intent))
            ready = true
        }
        setContent {
            val dark = when (Store.mode) { 1 -> false; 2 -> true; else -> isSystemInDarkTheme() }
            @Suppress("UNUSED_EXPRESSION") Store.rev
            LaunchedEffect(dark) {
                enableEdgeToEdge(
                    statusBarStyle = SystemBarStyle.auto(AColor.TRANSPARENT, AColor.TRANSPARENT) { dark },
                    navigationBarStyle = SystemBarStyle.auto(if (dark) 0xFF0B0B0B.toInt() else AColor.WHITE, if (dark) 0xFF0B0B0B.toInt() else AColor.WHITE) { dark })
            }
            CompositionLocalProvider(LocalDark provides dark, LocalOverscrollConfiguration provides null) {
                MaterialTheme(colorScheme = if (dark) darkColorScheme(primary = Color(0xFFF2F2F2), background = Color(0xFF0B0B0B), surface = Color(0xFF0B0B0B)) else lightColorScheme(primary = Color(0xFF111111), background = Color.White, surface = Color.White)) {
                    Box(Modifier.fillMaxSize().background(bgOf()), contentAlignment = Alignment.TopCenter) {
                        Box(Modifier.widthIn(max = 520.dp).fillMaxSize()) {
                            Intro { if (ready) Box(Modifier.fillMaxSize().navigationBarsPadding()) { NavHost() } }
                            OverlayHost()
                        }
                    }
                }
            }
        }
        lifecycleScope.launch { repeatOnLifecycle(Lifecycle.State.RESUMED) { boot() } }
    }

    override fun onNewIntent(i: Intent) {
        super.onNewIntent(i)
        val p = i.data?.let { u -> if (u.host == "hulhup.my.id" || u.host == "www.hulhup.my.id") (u.encodedPath ?: "/") else null } ?: return
        pageFor(p)?.let { Nav.go(it) }
    }

    private fun initial(i: Intent?): Array<Screen> {
        val home = Screen("/") { HomePage() }
        val p = i?.data?.takeIf { it.host == "hulhup.my.id" || it.host == "www.hulhup.my.id" }?.encodedPath
        val t = if (p != null && p != "/") pageFor(p) else null
        return if (t == null) arrayOf(home) else arrayOf(home, t)
    }

    /** Catat hari masuk, tampilkan notifikasi/pengingat. Dipanggil saat dibuka dan saat kembali ke depan. */
    private suspend fun boot() {
        val n = Store.start()
        if (n != null) { delay(900); toast(Store.t("n_streak").replace("{n}", "$n")) }
    }
}
