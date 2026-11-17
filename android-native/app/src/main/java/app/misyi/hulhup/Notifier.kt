package app.misyi.hulhup

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.*
import org.json.JSONObject
import java.util.Calendar
import java.util.concurrent.TimeUnit

/** Notifikasi di HP (padanan notify.dart). Ikon kecil = logo putih (ic_stat_hulhup), ikon besar = hulhup_large. */
object Notifier {
    const val CH = "hulhup_main"
    var permissionRequester: (() -> Unit)? = null

    fun ensureChannel(c: Context) {
        if (Build.VERSION.SDK_INT >= 26) {
            val m = c.getSystemService(NotificationManager::class.java)
            m.createNotificationChannel(NotificationChannel(CH, "Notifikasi Hulhup", NotificationManager.IMPORTANCE_HIGH).apply { description = "Pengingat dan notifikasi dari Hulhup" })
        }
    }

    fun enabled(): Boolean {
        val c = Store.app
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(c, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false
        return NotificationManagerCompat.from(c).areNotificationsEnabled()
    }

    /** Minta izin notifikasi (Android 13+). Aman dipanggil berulang. */
    fun allow(): Boolean { if (!enabled()) permissionRequester?.invoke(); return enabled() }

    fun build(c: Context, title: String, body: String, sub: String, path: String? = null): NotificationCompat.Builder {
        ensureChannel(c)
        // Ketuk notifikasi membuka layar yang tepat (alamat yang sama dengan web), mis. /notifications.
        val open = Intent(c, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        if (path != null) { open.action = Intent.ACTION_VIEW; open.data = android.net.Uri.parse("https://hulhup.my.id$path") }
        val pi = PendingIntent.getActivity(c, path?.hashCode() ?: 0, open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        return NotificationCompat.Builder(c, CH).setSmallIcon(R.drawable.ic_stat_hulhup)
            .setLargeIcon(BitmapFactory.decodeResource(c.resources, R.drawable.hulhup_large))
            .setColor(0xFF5B47F5.toInt()).setSubText(sub).setContentTitle(title).setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body)).setPriority(NotificationCompat.PRIORITY_HIGH).setAutoCancel(true).setContentIntent(pi)
    }

    fun show(id: Int, title: String, body: String, sub: String, path: String? = null) {
        try {
            val c = Store.app
            if (!enabled()) return
            NotificationManagerCompat.from(c).notify(id, build(c, title, body, sub, path).build())
        } catch (_: SecurityException) {} catch (_: Exception) {}
    }

    /** Notifikasi berulang tiap hari pada jam tertentu (waktu setempat), terlepas dari apakah aplikasi sudah dibuka hari itu. */
    fun daily(id: Int, hour: Int, minute: Int, title: String, body: String, sub: String) {
        try {
            val c = Store.app
            c.getSharedPreferences("hulhup", Context.MODE_PRIVATE).edit().putString("rem_$id", JSONObject().put("h", hour).put("m", minute).put("t", title).put("b", body).put("s", sub).toString()).apply()
            schedule(c, id, hour, minute, title, body, sub)
        } catch (_: Exception) {}
    }

    fun schedule(c: Context, id: Int, hour: Int, minute: Int, title: String, body: String, sub: String) {
        val now = Calendar.getInstance()
        val at = Calendar.getInstance().apply { set(Calendar.HOUR_OF_DAY, hour); set(Calendar.MINUTE, minute); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0) }
        if (!at.after(now)) at.add(Calendar.DAY_OF_MONTH, 1)
        val i = Intent(c, ReminderReceiver::class.java).putExtra("id", id).putExtra("h", hour).putExtra("m", minute).putExtra("t", title).putExtra("b", body).putExtra("s", sub)
        val pi = PendingIntent.getBroadcast(c, id, i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val am = c.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        // Alarm tepat waktu (jam 19.00 pas); bila izin alarm tepat tidak ada, pakai alarm hemat daya.
        if (Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at.timeInMillis, pi)
        else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at.timeInMillis, pi)
    }

    fun cancelReminders() {
        try {
            val c = Store.app; val am = c.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            for (id in 101..103) {
                am.cancel(PendingIntent.getBroadcast(c, id, Intent(c, ReminderReceiver::class.java), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
                c.getSharedPreferences("hulhup", Context.MODE_PRIVATE).edit().remove("rem_$id").apply()
            }
        } catch (_: Exception) {}
    }

    /** Nyalakan/matikan pengecekan notifikasi di latar belakang (hanya saat sudah masuk dan tanpa Firebase). */
    fun watch(on: Boolean) {
        try {
            val w = WorkManager.getInstance(Store.app)
            if (on) w.enqueueUniquePeriodicWork("hulhup-notif", ExistingPeriodicWorkPolicy.UPDATE,
                PeriodicWorkRequestBuilder<NotifWorker>(15, TimeUnit.MINUTES).setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build())
            else w.cancelUniqueWork("hulhup-notif")
        } catch (_: Exception) {}
    }
}

class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(c: Context, i: Intent) {
        val id = i.getIntExtra("id", 101); val h = i.getIntExtra("h", 19); val m = i.getIntExtra("m", 0)
        val t = i.getStringExtra("t") ?: "Hulhup"; val b = i.getStringExtra("b") ?: ""; val s = i.getStringExtra("s") ?: ""
        try { if (Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(c, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) NotificationManagerCompat.from(c).notify(id, Notifier.build(c, t, b, s).build()) } catch (_: SecurityException) {}
        Notifier.schedule(c, id, h, m, t, b, s)
    }
}

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(c: Context, i: Intent) {
        val sp = c.getSharedPreferences("hulhup", Context.MODE_PRIVATE)
        for (id in 101..103) sp.getString("rem_$id", null)?.let { s -> try { val o = JSONObject(s); Notifier.schedule(c, id, o.getInt("h"), o.getInt("m"), o.getString("t"), o.getString("b"), o.getString("s")) } catch (_: Exception) {} }
    }
}

/** Tugas latar belakang ±tiap 15 menit: cek notifikasi baru lalu tampilkan (padanan bgCheck). */
class NotifWorker(c: Context, p: WorkerParameters) : CoroutineWorker(c, p) {
    override suspend fun doWork(): Result {
        try {
            val sp = applicationContext.getSharedPreferences("hulhup", Context.MODE_PRIVATE)
            val tok = sp.getString("token", null) ?: return Result.success()
            val rq = okhttp3.Request.Builder().url(BuildConfig.API_URL + "/me").header("Authorization", "Bearer $tok").build()
            val r = okhttp3.OkHttpClient.Builder().callTimeout(25, TimeUnit.SECONDS).build().newCall(rq).execute()
            if (r.code != 200) return Result.success()
            val n = JSONObject(r.body!!.string()).optInt("unread_social", 0)
            val last = sp.getInt("pushed", 0)
            if (n > last && Build.VERSION.SDK_INT >= 0) {
                val en = sp.getString("lang", "id") == "en"
                val c = applicationContext
                if (Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(c, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED)
                    NotificationManagerCompat.from(c).notify(1, Notifier.build(c, "Hulhup", if (en) "You have $n new notifications" else "Kamu punya $n notifikasi baru", if (en) "Notification" else "Notifikasi", "/notifications").build())
            }
            sp.edit().putInt("pushed", n).apply()
        } catch (_: Exception) {}
        return Result.success()
    }
}
