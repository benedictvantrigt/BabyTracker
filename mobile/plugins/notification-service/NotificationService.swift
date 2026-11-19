import Foundation
import Security
import UserNotifications

/// Decrypts a reminder the relay pushed before it shows (#6). The push carries the reminder
/// sealed with the family key ("payload"); the key comes from the App Group keychain, where the
/// app keeps it. If anything fails, the push's own neutral text ("Reminder") shows.
class NotificationService: UNNotificationServiceExtension {
  private var contentHandler: ((UNNotificationContent) -> Void)?
  private var content: UNMutableNotificationContent?

  override func didReceive(
    _ request: UNNotificationRequest,
    withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
  ) {
    self.contentHandler = contentHandler
    guard let content = request.content.mutableCopy() as? UNMutableNotificationContent else {
      contentHandler(request.content)
      return
    }
    self.content = content
    if let sealed = content.userInfo["payload"] as? String, let reminder = ReminderOpener.open(sealed) {
      content.title = reminder.title
      content.body = reminder.body
      if reminder.alarm {
        if SharedState.alarmsHandleNightFeeds {
          // This phone rings night feeds as an AlarmKit alarm (#7): no second sound.
          content.interruptionLevel = .passive
          content.sound = nil
        } else {
          content.interruptionLevel = .timeSensitive
        }
      }
    }
    contentHandler(content)
  }

  override func serviceExtensionTimeWillExpire() {
    if let contentHandler, let content { contentHandler(content) }
  }
}

struct Reminder {
  let title: String
  let body: String
  let alarm: Bool
}

enum SharedState {
  /// "group.com.napchime.app" for the extension "com.napchime.app.NotificationService".
  static var appGroup: String {
    let id = Bundle.main.bundleIdentifier ?? "com.napchime.app.NotificationService"
    let app = id.hasSuffix(".NotificationService")
      ? String(id.dropLast(".NotificationService".count)) : id
    return "group." + app
  }

  static var alarmsHandleNightFeeds: Bool {
    UserDefaults(suiteName: appGroup)?.bool(forKey: "alarmKitNightFeeds") ?? false
  }

  /// The family id and its keys (newest first), stored by the app's ReminderKey module.
  static func reminderKeys() -> (familyId: String, keys: [Data])? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: "napchime.reminders",
      kSecAttrAccount as String: "reminderKey",
      kSecAttrAccessGroup as String: appGroup,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    var item: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
          let data = item as? Data,
          let value = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
          let familyId = value["familyId"] as? String,
          let keys = value["keys"] as? [String] else { return nil }
    return (familyId, keys.compactMap(Base64URL.decode))
  }
}

enum ReminderOpener {
  /// Mirrors `open` in mobile/src/sync/crypto.ts: "v2." + base64url(nonce || ciphertext),
  /// XChaCha20-Poly1305 bound to "bt/v2/reminder/<familyId>".
  static func open(_ sealed: String) -> Reminder? {
    guard sealed.hasPrefix("v2."),
          let bytes = Base64URL.decode(String(sealed.dropFirst(3))),
          let stored = SharedState.reminderKeys() else { return nil }
    let context = Data("bt/v2/reminder/\(stored.familyId)".utf8)
    for key in stored.keys {
      guard let plain = XChaCha20Poly1305.open(bytes, key: key, aad: context),
            let json = (try? JSONSerialization.jsonObject(with: plain)) as? [String: Any],
            let title = json["title"] as? String,
            let body = json["body"] as? String else { continue }
      return Reminder(title: title, body: body, alarm: json["alarm"] as? Bool ?? false)
    }
    return nil
  }
}

enum Base64URL {
  static func decode(_ text: String) -> Data? {
    var s = text.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
    while s.count % 4 != 0 { s += "=" }
    return Data(base64Encoded: s)
  }
}
