// The vault key on an iPhone or iPad (ES§40, ios_app). It is made on the device the first time it is asked for, as
// 32 random bytes, and kept in the Keychain for this device only: never synced, never in a backup another device opens.
// The Keychain keeps it through a reinstall, so a signing expiry means only reinstalling, with the notes intact.
//
// This file holds no Tauri code, so its tests (ios/Tests/KeeperTests.swift) build it on a Mac with a fake store in
// place of the Keychain: `node scripts/ios-app-check.mjs keeper`.
import Foundation
import Security

enum KeeperError: Error, Equatable {
  case store(OSStatus)
  case random
}

/// Where the vault key is kept. On a phone, the Keychain; in the tests, a fake.
protocol SecretStore {
  /// The bytes kept under this service and account, nil when there are none, or a store error.
  func find(service: String, account: String) throws -> [UInt8]?
  /// Keeps new bytes, readable only on this device once it has been unlocked once since it started.
  func add(service: String, account: String, secret: [UInt8]) throws
}

/// The device's Keychain.
struct Keychain: SecretStore {
  func find(service: String, account: String) throws -> [UInt8]? {
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
    if status == errSecItemNotFound { return nil }
    throw KeeperError.store(status)
  }

  func add(service: String, account: String, secret: [UInt8]) throws {
    let keep: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
      kSecValueData as String: Data(secret),
      kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
    ]
    let kept = SecItemAdd(keep as CFDictionary, nil)
    guard kept == errSecSuccess else { throw KeeperError.store(kept) }
  }
}

enum Keeper {
  static let service = "app.thoughtknot.vault-key"
  static let account = "vault"
  static let keyBytes = 32

  /// The vault key: from the store, or made on this device and kept there the first time.
  static func vaultKey(in store: SecretStore = Keychain()) throws -> [UInt8] {
    // any answer but "not there" throws: a key the store cannot give now is never replaced by a new one
    if let kept = try store.find(service: service, account: account) { return kept }
    var fresh = [UInt8](repeating: 0, count: keyBytes)
    guard SecRandomCopyBytes(kSecRandomDefault, keyBytes, &fresh) == errSecSuccess else { throw KeeperError.random }
    try store.add(service: service, account: account, secret: fresh)
    return fresh
  }
}
