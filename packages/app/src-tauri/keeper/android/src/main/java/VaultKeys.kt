// The vault key's rules on Android (spec §40, android_app), apart from Android itself, so they are tested on any
// computer with Java, a fake store in place of the Keystore (src/test/java/VaultKeysTest.kt). Keeper.kt gives the real
// store: a sealing key in the Android Keystore and a file in the storage that is never backed up.
// - The vault key is 32 random bytes, made on the device the first time it is asked for. Only its sealed copy is kept.
// - A store that fails gives an error, never a new key: a vault is never cut off from its key by a new one.
// - A sealed copy whose sealing key is gone, or that does not open, is an error, and is never written over.
// - A key whose sealed copy could not be kept is not handed out, so nothing is written with a key that is then lost.
package app.thoughtknot.keeper

import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Where the sealing key lives. Each call throws if the store cannot be read. */
interface SealStore {
  /** The sealing key, if there is one. */
  fun existing(): SecretKey?

  /** A new sealing key, kept by the store. */
  fun make(): SecretKey
}

/** Where the sealed copy lives. Each call throws if it cannot be read or written. */
interface SealedFile {
  /** The sealed copy, or null when there is none yet. */
  fun read(): ByteArray?

  /** Keeps the sealed copy whole, or throws: never half of one. */
  fun write(sealed: ByteArray)
}

class KeeperException(message: String, cause: Throwable? = null) : Exception(message, cause)

class VaultKeys(
  private val store: SealStore,
  private val file: SealedFile,
  private val random: SecureRandom = SecureRandom(),
) {
  companion object {
    const val KEY_BYTES = 32
    const val NONCE_BYTES = 12
    const val TAG_BITS = 128
    private const val SEAL = "AES/GCM/NoPadding"
  }

  /** The vault key: opened from its sealed copy, or made and sealed the first time. */
  @Synchronized
  fun vaultKey(): ByteArray {
    val sealed = file.read()
    if (sealed != null) {
      val key = store.existing() ?: throw KeeperException("the sealing key is gone, so the vault key cannot be opened")
      return open(key, sealed)
    }
    val key = store.existing() ?: store.make()
    val fresh = ByteArray(KEY_BYTES)
    random.nextBytes(fresh)
    try {
      file.write(seal(key, fresh))
    } catch (e: Exception) {
      fresh.fill(0)
      throw KeeperException("the sealed vault key could not be kept", e)
    }
    return fresh
  }

  private fun seal(key: SecretKey, plain: ByteArray): ByteArray {
    val cipher = Cipher.getInstance(SEAL)
    cipher.init(Cipher.ENCRYPT_MODE, key)
    return cipher.iv + cipher.doFinal(plain)
  }

  private fun open(key: SecretKey, sealed: ByteArray): ByteArray {
    if (sealed.size != NONCE_BYTES + KEY_BYTES + TAG_BITS / 8) throw KeeperException("the sealed vault key is damaged")
    try {
      val cipher = Cipher.getInstance(SEAL)
      cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(TAG_BITS, sealed, 0, NONCE_BYTES))
      return cipher.doFinal(sealed, NONCE_BYTES, sealed.size - NONCE_BYTES)
    } catch (e: Exception) {
      throw KeeperException("the sealed vault key does not open with this device's sealing key", e)
    }
  }
}
