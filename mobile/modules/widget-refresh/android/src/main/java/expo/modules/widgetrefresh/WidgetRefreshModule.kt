package expo.modules.widgetrefresh

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Redraws the home-screen widgets at set times: the day start (night mode ends), the day end
 * and midnight. Android's own periodic widget update is put off for hours in Doze, so the
 * widget kept showing "Night" in the morning until the app was opened.
 *
 * One alarm at a time, for the earliest time still to come; the others wait in the app's
 * preferences and the receiver sets the next. The redraw itself is the widget's normal update
 * (WIDGET_UPDATE in JS), which also sets the times again. After a restart Android updates
 * the widgets itself, so that sets them again too.
 */
class WidgetRefreshModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("WidgetRefresh")

    Function("schedule") { times: List<Double> ->
      WidgetRefreshAlarm.store(context, times.map { it.toLong() })
      WidgetRefreshAlarm.armNext(context)
    }
  }
}

class WidgetRefreshReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    WidgetRefreshAlarm.updateWidgets(context)
    WidgetRefreshAlarm.armNext(context)
  }
}

object WidgetRefreshAlarm {
  private const val PREFS = "widget_refresh"
  private const val KEY = "times"

  fun store(context: Context, times: List<Long>) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .putString(KEY, times.sorted().joinToString(","))
      .apply()
  }

  /** Sets the alarm for the earliest stored time still to come, or clears it. */
  fun armNext(context: Context) {
    val now = System.currentTimeMillis()
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val future = prefs.getString(KEY, "").orEmpty().split(",")
      .mapNotNull { it.toLongOrNull() }
      .filter { it > now }
    prefs.edit().putString(KEY, future.joinToString(",")).apply()

    val alarms = context.getSystemService(AlarmManager::class.java) ?: return
    val pending = PendingIntent.getBroadcast(
      context,
      0,
      Intent(context, WidgetRefreshReceiver::class.java),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val next = future.minOrNull()
    if (next == null) {
      alarms.cancel(pending)
      return
    }
    // Exact alarms can be turned off by the user (Android 12+): then within Doze's window.
    val exact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarms.canScheduleExactAlarms()
    if (exact) {
      alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, pending)
    } else {
      alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, pending)
    }
  }

  /** Asks this app's widget providers for their normal update, as Android's periodic one does. */
  fun updateWidgets(context: Context) {
    val manager = AppWidgetManager.getInstance(context)
    for (provider in manager.installedProviders) {
      if (provider.provider.packageName != context.packageName) continue
      val ids = manager.getAppWidgetIds(provider.provider)
      if (ids.isEmpty()) continue
      context.sendBroadcast(
        Intent(AppWidgetManager.ACTION_APPWIDGET_UPDATE)
          .setComponent(provider.provider)
          .putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids),
      )
    }
  }
}
