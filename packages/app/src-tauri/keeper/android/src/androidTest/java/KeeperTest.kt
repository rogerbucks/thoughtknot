// The vault key on a real Android device or emulator (spec §40, android_app). It is made at first launch, and is the
// same at every launch after. Its sealing key is in the Android Keystore and cannot be read out. What is written holds
// the sealed copy only, never the key's bytes.
package app.thoughtknot.keeper

import android.security.keystore.KeyInfo
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.security.KeyStore
import javax.crypto.SecretKeyFactory
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class KeeperTest {
  private val context = InstrumentationRegistry.getInstrumentation().targetContext

  /** As at first launch: no sealed copy and no sealing key. */
  @Before
  fun firstLaunch() {
    File(context.noBackupFilesDir, Keeper.FILE).delete()
    KeyStore.getInstance("AndroidKeyStore").apply { load(null) }.deleteEntry(Keeper.ALIAS)
  }

  @Test
  fun theVaultKeyIsMadeAtFirstLaunchAndTheSameAfter() {
    assertNull(Keeper(context).sealedCopy())
    val first = Keeper(context).vaultKey()
    assertEquals(Keeper.KEY_BYTES, first.size)
    assertArrayEquals(first, Keeper(context).vaultKey())
  }

  @Test
  fun theSealingKeyLivesInTheKeystoreAndCannotBeReadOut() {
    val key = Keeper(context).sealingKey()
    assertNull("the Keystore gives no bytes of its key", key.encoded)
    val info = SecretKeyFactory.getInstance(key.algorithm, "AndroidKeyStore").getKeySpec(key, KeyInfo::class.java) as KeyInfo
    assertEquals(256, info.keySize)
  }

  @Test
  fun whatIsWrittenNeverHoldsTheVaultKey() {
    val key = Keeper(context).vaultKey()
    val sealed = Keeper(context).sealedCopy()!!
    val written = sealed.toList()
    assertFalse("the key's bytes are not in the sealed copy", java.util.Collections.indexOfSubList(written, key.toList()) >= 0)
    assertTrue("a nonce, the sealed key and its tag", sealed.size == Keeper.NONCE_BYTES + Keeper.KEY_BYTES + 16)
  }

  @Test
  fun aSealedCopyThatCannotBeOpenedIsNeverWrittenOver() {
    Keeper(context).vaultKey()
    val before = Keeper(context).sealedCopy()!!
    // the Keystore loses its key, as after a restore to another phone: the old copy stays, and the keeper refuses
    KeyStore.getInstance("AndroidKeyStore").apply { load(null) }.deleteEntry(Keeper.ALIAS)
    val refused = runCatching { Keeper(context).vaultKey() }
    assertTrue(refused.isFailure)
    assertArrayEquals(before, Keeper(context).sealedCopy())
  }
}
