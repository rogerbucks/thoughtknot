// The keeper's iPhone code (ios/Sources/Keeper.swift) with a fake store in place of the Keychain (ES§40, ios_app,
// test_ios_app). Built and run on a Mac by `node scripts/ios-app-check.mjs keeper`, which the normal suite calls on
// macOS (packages/app/test/ios-app.test.js). It prints one line per check and exits 1 on the first that fails.
import Foundation
import Security

/// A store in memory, which can be told to fail as a locked or broken Keychain would.
final class FakeStore: SecretStore {
  var kept: [String: [UInt8]] = [:]
  var adds = 0
  var findFails: OSStatus?
  var addFails: OSStatus?

  func find(service: String, account: String) throws -> [UInt8]? {
    if let status = findFails { throw KeeperError.store(status) }
    return kept["\(service)/\(account)"]
  }

  func add(service: String, account: String, secret: [UInt8]) throws {
    if let status = addFails { throw KeeperError.store(status) }
    adds += 1
    kept["\(service)/\(account)"] = secret
  }
}

@main
struct KeeperTests {
  static func check(_ ok: Bool, _ what: String) {
    print("\(ok ? "ok" : "FAILED") - \(what)")
    if !ok { exit(1) }
  }

  static func main() throws {
    // first launch: the store is empty, so a key is made and kept
    let store = FakeStore()
    let first = try Keeper.vaultKey(in: store)
    check(first.count == 32, "the first ask makes a key of 32 bytes")
    check(store.adds == 1, "it is kept in the store")
    check(store.kept["app.thoughtknot.vault-key/vault"] == first, "under the keeper's own name")

    // every launch after: the same key, and nothing new is kept
    check(try Keeper.vaultKey(in: store) == first, "a second ask gives the same key")
    check(store.adds == 1, "and keeps nothing new")

    // made on the device: two devices never share a key, so none can be carried in the app
    check(try Keeper.vaultKey(in: FakeStore()) != first, "another device makes another key")
    check(first.contains { $0 != 0 }, "the key is random bytes, not zeros")

    // a store that cannot answer now (locked, broken) never has its key replaced
    let locked = FakeStore()
    locked.kept = store.kept
    locked.findFails = errSecInteractionNotAllowed
    var threw = false
    do { _ = try Keeper.vaultKey(in: locked) } catch KeeperError.store(errSecInteractionNotAllowed) { threw = true }
    check(threw, "a locked store gives an error, not a new key")
    check(locked.adds == 0 && locked.kept == store.kept, "and the kept key is left as it was")

    // a key that cannot be kept is never handed out: the notes would be sealed by a key lost at the next launch
    let full = FakeStore()
    full.addFails = errSecDiskFull
    threw = false
    do { _ = try Keeper.vaultKey(in: full) } catch KeeperError.store(errSecDiskFull) { threw = true }
    check(threw, "a key the store cannot keep is not handed out")

    // the Keychain itself: this device only, readable after the first unlock, so a reinstall keeps it
    check(Keeper.service == "app.thoughtknot.vault-key" && Keeper.account == "vault", "the Keychain item's name")
    print("all keeper checks passed")
  }
}
