package expo.modules.timernotification

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.graphics.Color
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
}

/**
 * An ongoing notification per running timer whose time counts up on its own (a chronometer from
 * the timer's start), so the app does not have to update it. On Android 16 and later it asks to be
 * promoted to a Live Update: a chip in the status bar and a prominent card on the lock screen.
 * When the user swipes it away it stays away for that timer (#51): Google asks Live Updates to
 * respect a dismissal, and unwanted ones lead users to revoke the permission.
 */
class TimerNotificationModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val manager: NotificationManager
    get() = context.getSystemService(NotificationManager::class.java)

  override fun definition() = ModuleDefinition {
    Name("TimerNotification")

    /** Posts the notification for a timer, or updates it in place; not after the user dismissed it. */
    Function("show") { timer: TimerNotificationRecord ->
      if (timer.id !in dismissed(context)) {
        manager.notify(TAG_PREFIX + timer.id, NOTIFICATION_ID, build(timer))
      }
    }

    /** Forgets dismissals of timers that are no longer running. */
    Function("forgetDismissed") { runningIds: List<String> ->
      val keep = dismissed(context).intersect(runningIds.toSet())
      prefs(context).edit().putStringSet(KEY_DISMISSED, keep).apply()
    }

    Function("dismiss") { id: String ->
      manager.cancel(TAG_PREFIX + id, NOTIFICATION_ID)
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
      .setWhen(timer.start.toLong())
      .setShowWhen(true)
      .setUsesChronometer(true)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setContentIntent(openApp())
      .setDeleteIntent(onDismiss(timer.id))
      .setRequestPromotedOngoing(true)
      .apply { timer.color?.let { setColor(Color.parseColor(it)) } }
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

  private fun onDismiss(id: String): PendingIntent {
    val intent = Intent(context, TimerDismissedReceiver::class.java).putExtra(EXTRA_ID, id)
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
    private const val TAG_PREFIX = "live-timer-"
    private const val NOTIFICATION_ID = 1
    private const val PREFS = "timer-notification"
    private const val KEY_DISMISSED = "dismissed"
    internal const val EXTRA_ID = "timerId"

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    internal fun dismissed(context: Context): Set<String> =
      prefs(context).getStringSet(KEY_DISMISSED, null)?.toSet() ?: emptySet()

    internal fun markDismissed(context: Context, id: String) {
      prefs(context).edit().putStringSet(KEY_DISMISSED, dismissed(context) + id).apply()
    }
  }
}

/** Receives the delete intent when the user swipes a timer notification away. Not exported. */
class TimerDismissedReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val id = intent.getStringExtra(TimerNotificationModule.EXTRA_ID) ?: return
    TimerNotificationModule.markDismissed(context, id)
  }
}
