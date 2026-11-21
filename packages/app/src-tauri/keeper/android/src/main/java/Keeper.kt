// The vault key on Android (spec §40, android_app). It is made on the device the first time it is asked for, as 32
// random bytes (VaultKeys.kt, where its rules are). It is sealed by a key that the Android Keystore makes and keeps, and
// that never leaves it. Only the sealed copy is written, in the app's own storage that is never backed up. So the app
// carries no key, and the vault key can be opened only on this device.
package app.thoughtknot.keeper

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.io.File
import java.security.KeyStore
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey

/** The sealing key in the Android Keystore. Its bytes never leave the Keystore. */
class KeystoreSeal : SealStore {
  override fun existing(): SecretKey? {
    val store = KeyStore.getInstance(Keeper.STORE).apply { load(null) }
    return store.getKey(Keeper.ALIAS, null) as SecretKey?
  }

  override fun make(): SecretKey {
    val make = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, Keeper.STORE)
    make.init(
      KeyGenParameterSpec.Builder(Keeper.ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256)
        .build())
    return make.generateKey()
  }
}

/** The sealed copy, in the app's storage that is never backed up. */
class NoBackupFile(private val file: File) : SealedFile {
  override fun read(): ByteArray? = if (file.exists()) file.readBytes() else null

  override fun write(sealed: ByteArray) {
    // written whole beside it, then renamed over: a failed write leaves no half key
    val next = File(file.parentFile, "${file.name}.new")
    next.writeBytes(sealed)
    if (!next.renameTo(file)) throw KeeperException("the sealed vault key could not be kept")
  }
}

class Keeper(private val context: Context) {
  companion object {
    /** The name the Keystore knows the sealing key by. */
    const val ALIAS = "thoughtknot-vault-seal"
    /** The sealed vault key's file, in the storage that is never backed up. */
    const val FILE = "vault-key.sealed"
    const val KEY_BYTES = VaultKeys.KEY_BYTES
    const val NONCE_BYTES = VaultKeys.NONCE_BYTES
    const val STORE = "AndroidKeyStore"

    // one for the app, so two asks at once never make two keys
    @Volatile private var keys: VaultKeys? = null
  }

  private val file: File
    get() = File(context.noBackupFilesDir, FILE)

  private fun keys(): VaultKeys =
    keys ?: synchronized(Companion) { keys ?: VaultKeys(KeystoreSeal(), NoBackupFile(file)).also { keys = it } }

  /** The sealing key in the Keystore, made the first time. Its bytes never leave the Keystore. */
  fun sealingKey(): SecretKey = KeystoreSeal().let { it.existing() ?: it.make() }

  /** The vault key: opened from its sealed copy, or made and sealed the first time. */
  fun vaultKey(): ByteArray = keys().vaultKey()

  /** The sealed copy as written, for the tests: it never holds the vault key's bytes. */
  fun sealedCopy(): ByteArray? = NoBackupFile(file).read()
}
