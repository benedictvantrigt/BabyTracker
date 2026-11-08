package expo.modules.timernotification

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
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
      manager.notify(TAG_PREFIX + timer.id, NOTIFICATION_ID, build(timer))
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

  /** The icon the expo-notifications config plugin installs, else the app icon. */
  private fun smallIcon(): Int {
    val id = context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
    return if (id != 0) id else context.applicationInfo.icon
  }

  private companion object {
    const val TAG_PREFIX = "live-timer-"
    const val NOTIFICATION_ID = 1
  }
}
