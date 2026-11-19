import ExpoModulesCore
import Foundation
import Security

/// Keeps the family key where the notification service extension can read it (#6): a
/// keychain item in the App Group's access group, readable after the first unlock so pushed
/// reminders decrypt while the phone is locked. The previous key is kept for one rotation,
/// so a reminder sealed just before a key change still opens.
public class ReminderKeyModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ReminderKey")

    /// Stores the key (base64url) of `familyId`; null for either clears it.
    Function("set") { (familyId: String?, key: String?) in
      guard let familyId, let key else {
        Self.delete()
        return
      }
      let current = Self.read()
      let stored = current?["familyId"] as? String == familyId
        ? (current?["keys"] as? [String] ?? []) : []
      if stored.first == key { return }
      let keys = [key] + stored.prefix(1)
      let value: [String: Any] = ["familyId": familyId, "keys": keys]
      guard let data = try? JSONSerialization.data(withJSONObject: value) else { return }
      Self.write(data)
    }
  }

  private static var accessGroup: String {
    "group." + (Bundle.main.bundleIdentifier ?? "com.napchime.app")
  }

  private static func query() -> [String: Any] {
    [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: "napchime.reminders",
      kSecAttrAccount as String: "reminderKey",
      kSecAttrAccessGroup as String: accessGroup,
    ]
  }

  private static func read() -> [String: Any]? {
    var q = query()
    q[kSecReturnData as String] = true
    q[kSecMatchLimit as String] = kSecMatchLimitOne
    var item: CFTypeRef?
    guard SecItemCopyMatching(q as CFDictionary, &item) == errSecSuccess,
          let data = item as? Data else { return nil }
    return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
  }

  private static func write(_ data: Data) {
    let update: [String: Any] = [
      kSecValueData as String: data,
      kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
    ]
    if SecItemUpdate(query() as CFDictionary, update as CFDictionary) == errSecItemNotFound {
      var add = query()
      add.merge(update) { $1 }
      SecItemAdd(add as CFDictionary, nil)
    }
  }

  private static func delete() {
    SecItemDelete(query() as CFDictionary)
  }
}
