// The vault key on an iPhone or iPad (spec §40, ios_app). It is made on the device the first time it is asked for, as
// 32 random bytes, and kept in the Keychain for this device only: never synced, never in a backup another device opens.
// The Keychain keeps it through a reinstall, so a signing expiry means only reinstalling, with the notes intact.
import Foundation
import Security
import SwiftRs
import Tauri
import UIKit
import WebKit

enum KeeperError: Error {
  case store(OSStatus)
  case random
}

enum Keeper {
  static let service = "app.thoughtknot.vault-key"
  static let account = "vault"
  static let keyBytes = 32

  /// The vault key: from the Keychain, or made and kept there the first time.
  static func vaultKey() throws -> [UInt8] {
    let find: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    var found: CFTypeRef?
    let status = SecItemCopyMatching(find as CFDictionary, &found)
    if status == errSecSuccess, let data = found as? Data { return [UInt8](data) }
    // any answer but "not there" is an error: a key the Keychain cannot give now is never replaced by a new one
    guard status == errSecItemNotFound else { throw KeeperError.store(status) }
    var fresh = [UInt8](repeating: 0, count: keyBytes)
    guard SecRandomCopyBytes(kSecRandomDefault, keyBytes, &fresh) == errSecSuccess else { throw KeeperError.random }
    let keep: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
      kSecValueData as String: Data(fresh),
      kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
    ]
    let kept = SecItemAdd(keep as CFDictionary, nil)
    guard kept == errSecSuccess else { throw KeeperError.store(kept) }
    return fresh
  }
}

struct Kept: Encodable {
  let key: [UInt8]
}

class KeeperPlugin: Plugin {
  @objc public func vaultKey(_ invoke: Invoke) throws {
    do {
      invoke.resolve(Kept(key: try Keeper.vaultKey()))
    } catch {
      invoke.reject("the device's secure store could not give the vault key: \(error)")
    }
  }
}

@_cdecl("init_plugin_keeper")
func initPlugin() -> Plugin {
  return KeeperPlugin()
}
