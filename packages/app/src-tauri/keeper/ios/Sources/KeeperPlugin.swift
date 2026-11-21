// The keeper's door for the app's Rust side (src/lib.rs): it hands over the vault key that Keeper.swift keeps in the
// Keychain, made at first launch.
import SwiftRs
import Tauri
import UIKit
import WebKit

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
