// A model's key on an iPhone or iPad (ES§19, app_ai_key_keychain). It is kept in the Keychain for this device only:
// never synced, never in a backup another device opens, never in the vault or the app's settings. So each device is
// set up on its own. The person types the key once. It is kept with the address it is for, and read again only in
// Swift, as a request to that address goes: the window never gets it back.
//
// This file holds no Tauri code, so it builds on its own with a fake store in place of the Keychain.
import Foundation
import Security

enum AiKeyError: Error, Equatable {
  case store(OSStatus)
  case notText
}

/// Where the keys are kept. On a phone, the Keychain; in a test, a fake.
protocol KeyStore {
  func find(service: String, account: String) throws -> Data?
  func put(service: String, account: String, secret: Data) throws
  func remove(service: String, account: String) throws
}

/// The device's Keychain, for this device only.
struct AiKeychain: KeyStore {
  private func query(_ service: String, _ account: String) -> [String: Any] {
    [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
    ]
  }

  func find(service: String, account: String) throws -> Data? {
    var find = query(service, account)
    find[kSecReturnData as String] = true
    find[kSecMatchLimit as String] = kSecMatchLimitOne
    var found: CFTypeRef?
    let status = SecItemCopyMatching(find as CFDictionary, &found)
    if status == errSecSuccess, let data = found as? Data { return data }
    if status == errSecItemNotFound { return nil }
    throw AiKeyError.store(status)
  }

  func put(service: String, account: String, secret: Data) throws {
    try remove(service: service, account: account)
    var keep = query(service, account)
    keep[kSecValueData as String] = secret
    keep[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
    let kept = SecItemAdd(keep as CFDictionary, nil)
    guard kept == errSecSuccess else { throw AiKeyError.store(kept) }
  }

  func remove(service: String, account: String) throws {
    let gone = SecItemDelete(query(service, account) as CFDictionary)
    guard gone == errSecSuccess || gone == errSecItemNotFound else { throw AiKeyError.store(gone) }
  }
}

enum AiKeys {
  /// The Keychain service the keys are kept under, apart from the vault key's.
  static let service = "app.thoughtknot.ai-key"

  /// Keeps the key for the model's address: it is written into a request to that address only (Requests.swift).
  static func keep(name: String, key: String, address: String, in store: KeyStore = AiKeychain()) throws {
    guard let origin = KeyFill.origin(of: address), !key.contains("\n") else { throw AiKeyError.notText }
    try store.put(service: service, account: name, secret: Data("\(origin)\n\(key)".utf8))
  }

  static func has(name: String, in store: KeyStore = AiKeychain()) throws -> Bool {
    try store.find(service: service, account: name) != nil
  }

  /// The key kept under the name, with the address it was kept for. Read only here, as a request goes: the window is
  /// never handed it.
  static func kept(name: String, in store: KeyStore = AiKeychain()) throws -> (origin: String, key: String)? {
    guard let data = try store.find(service: service, account: name) else { return nil }
    guard let text = String(data: data, encoding: .utf8), let cut = text.firstIndex(of: "\n") else {
      throw AiKeyError.notText
    }
    return (String(text[..<cut]), String(text[text.index(after: cut)...]))
  }

  static func forget(name: String, in store: KeyStore = AiKeychain()) throws {
    try store.remove(service: service, account: name)
  }
}
