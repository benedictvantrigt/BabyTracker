import ExpoModulesCore
import UIKit

// The notification expo-widgets posts when a widget button's intent runs (WidgetsModule.swift).
// With the intent running in the app's process (scripts/patch-expo-widgets.js), it arrives here.
private let widgetTapNotification = Notification.Name("onExpoWidgetsUserInteraction")
// iOS gives a background task about 30 seconds; let go a little before it would end it.
private let holdSeconds: TimeInterval = 25
// Where the Live Activity button's intent keeps its taps (scripts/patch-expo-widgets.js).
private let liveTapsKey = "napchime_live_taps"

/**
 * A home-screen widget tap runs its intent in the app, waking it in the background if needed.
 * The intent itself only queues the tap: the JavaScript writes the entry and syncs it, which
 * takes a few seconds. This module asks iOS for that time and gives it back when JS calls
 * `release()`, or after `holdSeconds`.
 */
public final class WidgetWakeModule: Module {
  private var task: UIBackgroundTaskIdentifier = .invalid
  private var timeout: DispatchWorkItem?
  private var observer: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("WidgetWake")

    OnCreate {
      self.observer = NotificationCenter.default.addObserver(
        forName: widgetTapNotification, object: nil, queue: .main
      ) { [weak self] _ in
        self?.hold()
      }
      // Launched in the background (by a widget tap, or a silent push): JS starts up and looks
      // for queued taps, and releases when done.
      DispatchQueue.main.async {
        if UIApplication.shared.applicationState == .background {
          self.hold()
        }
      }
    }

    OnDestroy {
      if let observer = self.observer {
        NotificationCenter.default.removeObserver(observer)
      }
      DispatchQueue.main.async { self.end() }
    }

    Function("release") {
      DispatchQueue.main.async { self.end() }
    }

    /**
     * Live Activity button taps (#97) the intent kept in the app group (patch-expo-widgets.js),
     * oldest first, each as { target, at }. Taking them removes them.
     */
    Function("takeLiveTaps") { () -> [[String: Any]] in
      guard let defaults = Self.appGroup() else { return [] }
      let taps = defaults.array(forKey: liveTapsKey) as? [[String: Any]] ?? []
      defaults.removeObject(forKey: liveTapsKey)
      return taps
    }
  }

  private static func appGroup() -> UserDefaults? {
    guard let group = Bundle.main.object(forInfoDictionaryKey: "ExpoWidgetsAppGroupIdentifier") as? String
    else { return nil }
    return UserDefaults(suiteName: group)
  }

  private func hold() {
    if task == .invalid {
      task = UIApplication.shared.beginBackgroundTask(withName: "Napchime widget tap") { [weak self] in
        self?.end()
      }
    }
    timeout?.cancel()
    let work = DispatchWorkItem { [weak self] in self?.end() }
    timeout = work
    DispatchQueue.main.asyncAfter(deadline: .now() + holdSeconds, execute: work)
  }

  private func end() {
    timeout?.cancel()
    timeout = nil
    if task != .invalid {
      UIApplication.shared.endBackgroundTask(task)
      task = .invalid
    }
  }
}
