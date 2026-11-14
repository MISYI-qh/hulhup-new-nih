package app.misyi.hulhup
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody

import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.suspendCancellableCoroutine
import org.json.JSONObject
import kotlin.coroutines.resume

/** Notifikasi dorong lewat Firebase (padanan push.dart). Konfigurasi bersifat publik, bukan rahasia. */
object Push {
    private var ready = false
    private var token: String? = null
    var active = false

    private fun init(): Boolean {
        if (ready) return true
        try {
            if (FirebaseApp.getApps(Store.app).isEmpty()) {
                FirebaseApp.initializeApp(Store.app, FirebaseOptions.Builder()
                    .setApiKey("AIzaSyCFtErbdLWkTwKIc3ADcRr27uTHFCYueCw")
                    .setApplicationId("1:555376760197:android:62421257c7742de9a7a0ec")
                    .setGcmSenderId("555376760197").setProjectId("hulhup").setStorageBucket("hulhup.firebasestorage.app").build())
            }
            ready = true
        } catch (_: Exception) {}
        return ready
    }

    /** Daftarkan HP ini ke server. true bila berhasil (maka pengecekan berkala tidak perlu). */
    suspend fun register(lang: String): Boolean {
        try {
            if (!init()) return false
            if (!Notifier.enabled()) Notifier.allow()
            val t = suspendCancellableCoroutine<String?> { k -> FirebaseMessaging.getInstance().token.addOnCompleteListener { k.resume(if (it.isSuccessful) it.result else null) } }
            if (t.isNullOrEmpty()) return false
            token = t
            Api.req("POST", "/me/push", JSONObject().put("token", t).put("lang", lang).put("remind", Store.remind))
            active = true
            return true
        } catch (_: Exception) { return false }
    }

    suspend fun unregister() { try { token?.let { Api.req("POST", "/me/push", JSONObject().put("token", it).put("on", false)) } } catch (_: Exception) {} }
}

class PushService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        val sp = getSharedPreferences("hulhup", MODE_PRIVATE)
        val tok = sp.getString("token", null) ?: return
        Thread {
            try {
                val body = JSONObject().put("token", token).put("lang", sp.getString("lang", "id")).put("remind", sp.getBoolean("remind", true)).toString()
                val rq = okhttp3.Request.Builder().url(BuildConfig.API_URL + "/me/push").header("Authorization", "Bearer $tok")
                    .post(body.toRequestBody("application/json".toMediaType())).build()
                okhttp3.OkHttpClient().newCall(rq).execute().close()
            } catch (_: Exception) {}
        }.start()
    }
    override fun onMessageReceived(m: RemoteMessage) {
        // Pesan berisi notification ditampilkan sistem; pesan data saja ditampilkan di sini.
        val n = m.notification; val d = m.data
        if (n != null) return
        val title = d["title"] ?: "Hulhup"; val body = d["body"] ?: return
        Notifier.ensureChannel(this)
        try { androidx.core.app.NotificationManagerCompat.from(this).notify((System.currentTimeMillis() % 100000).toInt(), Notifier.build(this, title, body, "").build()) } catch (_: SecurityException) {}
    }
}
