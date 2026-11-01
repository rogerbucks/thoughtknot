// The keeper's Android side, called by the app's Rust (keeper/src/lib.rs): the vault key, from Keeper.
package app.thoughtknot.keeper

import android.app.Activity
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@TauriPlugin
class KeeperPlugin(private val activity: Activity) : Plugin(activity) {
  @Command
  fun vaultKey(invoke: Invoke) {
    try {
      val key = Keeper(activity.applicationContext).vaultKey()
      val bytes = JSArray()
      for (b in key) bytes.put(b.toInt() and 0xff)
      key.fill(0)
      invoke.resolve(JSObject().apply { put("key", bytes) })
    } catch (e: Exception) {
      invoke.reject("the device's secure store could not give the vault key: ${e.message}")
    }
  }
}
