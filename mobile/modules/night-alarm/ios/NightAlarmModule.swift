import ExpoModulesCore
import Foundation
#if canImport(AlarmKit)
import AlarmKit
import SwiftUI
#endif

/// One night feed alarm to schedule.
struct NightAlarmRecord: Record {
  @Field var id: String = ""
  @Field var title: String = ""
  /// When it rings, in milliseconds since the epoch.
  @Field var fireAt: Double = 0
}

/// The App Group shared with the notification service extension (#6): it reads whether this
/// phone rings night feeds as alarms, and then shows a pushed night feed reminder quietly.
private func sharedDefaults() -> UserDefaults? {
  UserDefaults(suiteName: "group." + (Bundle.main.bundleIdentifier ?? "com.napchime.app"))
}
private let alarmsHandleNightFeedsKey = "alarmKitNightFeeds"
private let scheduledKey = "nightAlarmIds"

#if canImport(AlarmKit)
@available(iOS 26.0, *)
struct NightFeedMetadata: AlarmMetadata {}
#endif

/// Night feed alarms with AlarmKit on iOS 26+ (#7): they ring like an alarm clock, also in
/// silent mode and Focus. `schedule` replaces every alarm this module scheduled before.
public class NightAlarmModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NightAlarm")

    /// Whether AlarmKit exists on this iPhone (iOS 26+).
    Function("isAvailable") { () -> Bool in
      if #available(iOS 26.0, *) { return true }
      return false
    }

    /// "authorized", "denied", "notDetermined" or "unavailable".
    Function("authorizationState") { () -> String in
      #if canImport(AlarmKit)
      if #available(iOS 26.0, *) { return Self.describe(AlarmManager.shared.authorizationState) }
      #endif
      return "unavailable"
    }

    /// Asks the user once; afterwards returns the stored answer.
    AsyncFunction("requestAuthorization") { () async -> String in
      #if canImport(AlarmKit)
      if #available(iOS 26.0, *) {
        do {
          return Self.describe(try await AlarmManager.shared.requestAuthorization())
        } catch {
          return "denied"
        }
      }
      #endif
      return "unavailable"
    }

    /// Replaces this module's alarms with `alarms`; an empty list cancels them all.
    AsyncFunction("schedule") { (alarms: [NightAlarmRecord]) async throws -> Int in
      sharedDefaults()?.set(!alarms.isEmpty, forKey: alarmsHandleNightFeedsKey)
      #if canImport(AlarmKit)
      if #available(iOS 26.0, *) {
        return try await Self.replace(alarms)
      }
      #endif
      return 0
    }

    /// Whether this phone rings night feeds as alarms; the extension reads it (#6).
    Function("setHandlesNightFeeds") { (value: Bool) in
      sharedDefaults()?.set(value, forKey: alarmsHandleNightFeedsKey)
    }
  }

  #if canImport(AlarmKit)
  @available(iOS 26.0, *)
  private static func describe(_ state: AlarmManager.AuthorizationState) -> String {
    switch state {
    case .authorized: return "authorized"
    case .denied: return "denied"
    case .notDetermined: return "notDetermined"
    @unknown default: return "denied"
    }
  }

  @available(iOS 26.0, *)
  private static func replace(_ alarms: [NightAlarmRecord]) async throws -> Int {
    let manager = AlarmManager.shared
    let previous = UserDefaults.standard.stringArray(forKey: scheduledKey) ?? []
    for id in previous.compactMap(UUID.init(uuidString:)) {
      try? manager.cancel(id: id)
    }
    UserDefaults.standard.set([String](), forKey: scheduledKey)
    guard !alarms.isEmpty, manager.authorizationState == .authorized else { return 0 }

    var ids: [String] = []
    let now = Date()
    for alarm in alarms {
      let date = Date(timeIntervalSince1970: alarm.fireAt / 1000)
      if date <= now { continue }
      let alert = AlarmPresentation.Alert(
        title: LocalizedStringResource(stringLiteral: alarm.title),
        stopButton: AlarmButton(text: "Stop", textColor: .white, systemImageName: "stop.circle")
      )
      let attributes = AlarmAttributes<NightFeedMetadata>(
        presentation: AlarmPresentation(alert: alert),
        metadata: NightFeedMetadata(),
        tintColor: Color(red: 0x6E / 255, green: 0x56 / 255, blue: 0xCF / 255)
      )
      let configuration = AlarmManager.AlarmConfiguration<NightFeedMetadata>(
        schedule: .fixed(date),
        attributes: attributes
      )
      let id = UUID()
      _ = try await manager.schedule(id: id, configuration: configuration)
      ids.append(id.uuidString)
    }
    UserDefaults.standard.set(ids, forKey: scheduledKey)
    return ids.count
  }
  #endif
}
