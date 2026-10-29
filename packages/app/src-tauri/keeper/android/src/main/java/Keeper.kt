// The vault key on Android (spec §40, android_app). It is made on the device the first time it is asked for, as 32
// random bytes. It is sealed by a key that the Android Keystore makes and keeps, and that never leaves it. Only the
// sealed copy is written, in the app's own storage that is never backed up. So the app carries no key, and the vault
// key can be opened only on this device.
package app.thoughtknot.keeper

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.io.File
import java.security.KeyStore
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class Keeper(private val context: Context) {
  companion object {
    /** The name the Keystore knows the sealing key by. */
    const val ALIAS = "thoughtknot-vault-seal"
    /** The sealed vault key's file, in the storage that is never backed up. */
    const val FILE = "vault-key.sealed"
    const val KEY_BYTES = 32
    const val NONCE_BYTES = 12
    private const val SEAL = "AES/GCM/NoPadding"
    private const val STORE = "AndroidKeyStore"
  }

  private val file: File
    get() = File(context.noBackupFilesDir, FILE)

  /** The sealing key in the Keystore, made the first time. Its bytes never leave the Keystore. */
  fun sealingKey(): SecretKey {
    val store = KeyStore.getInstance(STORE).apply { load(null) }
    (store.getKey(ALIAS, null) as SecretKey?)?.let { return it }
    val make = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, STORE)
    make.init(
      KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256)
        .build())
    return make.generateKey()
  }

  /**
   * The vault key: opened from its sealed copy, or made and sealed the first time. A sealed copy that cannot be opened
   * is an error, never written over, so a vault is never cut off from its key by a new one.
   */
  @Synchronized
  fun vaultKey(): ByteArray {
    val key = sealingKey()
    if (file.exists()) {
      val sealed = file.readBytes()
      val open = Cipher.getInstance(SEAL)
      open.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, sealed, 0, NONCE_BYTES))
      return open.doFinal(sealed, NONCE_BYTES, sealed.size - NONCE_BYTES)
    }
    val fresh = ByteArray(KEY_BYTES).also { SecureRandom().nextBytes(it) }
    val seal = Cipher.getInstance(SEAL)
    seal.init(Cipher.ENCRYPT_MODE, key)
    val sealed = seal.iv + seal.doFinal(fresh)
    // written whole beside it, then renamed over: a failed write leaves no half key
    val next = File(file.parentFile, "$FILE.new")
    next.writeBytes(sealed)
    if (!next.renameTo(file)) throw IllegalStateException("the sealed vault key could not be kept")
    return fresh
  }

  /** The sealed copy as written, for the tests: it never holds the vault key's bytes. */
  fun sealedCopy(): ByteArray? = if (file.exists()) file.readBytes() else null
}
