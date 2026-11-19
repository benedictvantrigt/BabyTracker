package expo.modules.timernotification

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationCompat
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import expo.modules.kotlin.records.Required

class TimerNotificationRecord : Record {
  @Field @Required val id: String = ""
  @Field @Required val title: String = ""
  @Field val text: String = ""
  /** When the timer started, in milliseconds since the epoch. */
  @Field @Required val start: Double = 0.0
  @Field @Required val channelId: String = ""
  @Field val color: String? = null
  /** For a countdown: the time it counts down to (past it, the clock counts on). */
  @Field val countdownTo: Double? = null
  /** When the notification removes itself if it has not been updated, in ms since the epoch. */
  @Field val until: Double? = null
}

/**
 * An ongoing notification per running timer whose time counts up on its own (a chronometer from
 * the timer's start), so the app does not have to update it. The awake timer counts down to the
 * next nap instead, and goes on counting (as a negative time) once that has passed. On Android 16 and later it asks to be
 * promoted to a Live Update: a chip in the status bar and a prominent card on the lock screen.
 *
 * When the user swipes a timer away, it stays away (#51): the dismissal is recorded per timer id
 * and `show` posts nothing for that id until the app forgets it (the timer stopped).
 */
class TimerNotificationModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val manager: NotificationManager
    get() = context.getSystemService(NotificationManager::class.java)

  override fun definition() = ModuleDefinition {
    Name("TimerNotification")

    /** Posts the notification for a timer, or updates it in place. */
    Function("show") { timer: TimerNotificationRecord ->
      if (timer.id in dismissed(context)) return@Function
      manager.notify(TAG_PREFIX + timer.id, NOTIFICATION_ID, build(timer))
    }

    Function("dismiss") { id: String ->
      manager.cancel(TAG_PREFIX + id, NOTIFICATION_ID)
    }

    /** Timer ids the user swiped away; `show` skips them. */
    Function("dismissedIds") { dismissed(context).toList() }

    /** Forgets a swiped-away timer (it stopped), so a timer with that id shows again. */
    Function("forgetDismissed") { id: String -> setDismissed(context, id, false) }

    /**
     * Whether the app may post Live Updates (Android 16+); null on older versions, which have
     * no such setting.
     */
    Function("canPostPromoted") {
      if (Build.VERSION.SDK_INT >= 36) manager.canPostPromotedNotifications() else null
    }

    /** Opens the system page where the user allows Live Updates for this app (Android 16+). */
    Function("openPromotedSettings") {
      val intent = Intent("android.settings.MANAGE_APP_PROMOTED_NOTIFICATIONS")
        .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      val fallback = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
        .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      try {
        context.startActivity(intent)
      } catch (e: Exception) {
        context.startActivity(fallback)
      }
    }

    /** Timer ids whose notification is showing, so stale ones can be dismissed. */
    Function("activeIds") {
      manager.activeNotifications
        .filter { it.id == NOTIFICATION_ID }
        .mapNotNull { it.tag }
        .filter { it.startsWith(TAG_PREFIX) }
        .map { it.removePrefix(TAG_PREFIX) }
    }
  }

  private fun build(timer: TimerNotificationRecord) =
    NotificationCompat.Builder(context, timer.channelId)
      .setSmallIcon(smallIcon())
      .setContentTitle(timer.title)
      .setContentText(timer.text)
      .setWhen((timer.countdownTo ?: timer.start).toLong())
      .setShowWhen(true)
      .setUsesChronometer(true)
      .setChronometerCountDown(timer.countdownTo != null)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setContentIntent(openApp())
      .setDeleteIntent(onSwipedAway(timer.id))
      .setRequestPromotedOngoing(true)
      .apply { timer.color?.let { setColor(Color.parseColor(it)) } }
      .apply {
        timer.until?.let { setTimeoutAfter(maxOf(1L, it.toLong() - System.currentTimeMillis())) }
      }
      .build()

  private fun openApp(): PendingIntent? {
    val intent = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
    return PendingIntent.getActivity(
      context,
      0,
      intent,
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )
  }

  private fun onSwipedAway(id: String): PendingIntent {
    val intent = Intent(context, TimerDismissedReceiver::class.java)
      .setAction(ACTION_DISMISSED)
      .putExtra(EXTRA_ID, id)
    return PendingIntent.getBroadcast(
      context,
      id.hashCode(),
      intent,
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )
  }

  /** The icon the expo-notifications config plugin installs, else the app icon. */
  private fun smallIcon(): Int {
    val id = context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
    return if (id != 0) id else context.applicationInfo.icon
  }

  companion object {
    const val TAG_PREFIX = "live-timer-"
    const val NOTIFICATION_ID = 1
    const val ACTION_DISMISSED = "expo.modules.timernotification.DISMISSED"
    const val EXTRA_ID = "id"
    private const val PREFS = "timer-notification"
    private const val KEY_DISMISSED = "dismissed"

    fun dismissed(context: Context): Set<String> =
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .getStringSet(KEY_DISMISSED, emptySet())
        ?.toSet() ?: emptySet()

    fun setDismissed(context: Context, id: String, value: Boolean) {
      val ids = dismissed(context).toMutableSet()
      if (value) ids.add(id) else ids.remove(id)
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .edit()
        .putStringSet(KEY_DISMISSED, ids)
        .apply()
    }
  }
}

/** Records that the user swiped a timer notification away (its delete intent). */
class TimerDismissedReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != TimerNotificationModule.ACTION_DISMISSED) return
    val id = intent.getStringExtra(TimerNotificationModule.EXTRA_ID) ?: return
    TimerNotificationModule.setDismissed(context, id, true)
  }
}
