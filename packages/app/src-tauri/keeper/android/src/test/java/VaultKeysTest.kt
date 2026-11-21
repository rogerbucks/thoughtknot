// The vault key's rules on Android (VaultKeys.kt), with a fake store in place of the Android Keystore, so they run on
// any computer with Java: `node scripts/android-app-check.mjs keeper` builds this with kotlinc and runs it. Each check
// prints "ok - <what>"; one that fails prints "FAILED - <what>" and the run exits 1. The real Keystore is tried on an
// Android emulator (src/androidTest/java/KeeperTest.kt).
package app.thoughtknot.keeper

import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import kotlin.system.exitProcess

/** A store in memory. `broken` makes every call throw, as a Keystore that cannot be read does. */
class FakeSeal : SealStore {
  var key: SecretKey? = null
  var broken = false
  var made = 0

  override fun existing(): SecretKey? {
    if (broken) throw IllegalStateException("the store cannot be read")
    return key
  }

  override fun make(): SecretKey {
    if (broken) throw IllegalStateException("the store cannot be read")
    made++
    return KeyGenerator.getInstance("AES").apply { init(256) }.generateKey().also { key = it }
  }
}

/** A file in memory. `full` makes a write throw, as a full disk does. */
class FakeFile : SealedFile {
  var sealed: ByteArray? = null
  var full = false
  var writes = 0

  override fun read(): ByteArray? = sealed?.copyOf()

  override fun write(sealed: ByteArray) {
    if (full) throw java.io.IOException("no space left")
    writes++
    this.sealed = sealed.copyOf()
  }
}

private var failed = 0

private fun check(what: String, ok: Boolean) {
  println(if (ok) "ok - $what" else "FAILED - $what")
  if (!ok) failed++
}

private fun fails(block: () -> Unit): Boolean = runCatching(block).isFailure

private fun holds(haystack: ByteArray, needle: ByteArray): Boolean =
  java.util.Collections.indexOfSubList(haystack.toList(), needle.toList()) >= 0

fun main() {
  run {
    val seal = FakeSeal()
    val file = FakeFile()
    check("a first launch has no sealed copy", file.read() == null)
    val first = VaultKeys(seal, file).vaultKey()
    check("the first ask makes a key of 32 bytes", first.size == 32 && seal.made == 1 && file.writes == 1)
    check("a second ask gives the same key", first.contentEquals(VaultKeys(seal, file).vaultKey()))
    check("and makes nothing new", seal.made == 1 && file.writes == 1)
    val sealed = file.read()!!
    check("what is written is the sealed copy: a nonce, the sealed key and its tag", sealed.size == 12 + 32 + 16)
    check("what is written never holds the key's bytes", !holds(sealed, first))
    val other = VaultKeys(FakeSeal(), FakeFile()).vaultKey()
    check("another device makes another key", !first.contentEquals(other))
  }
  run {
    val seal = FakeSeal().apply { broken = true }
    val file = FakeFile()
    check("a store that cannot be read gives an error at first launch", fails { VaultKeys(seal, file).vaultKey() })
    check("and nothing is written", file.writes == 0)
  }
  run {
    val seal = FakeSeal()
    val file = FakeFile()
    VaultKeys(seal, file).vaultKey()
    val before = file.read()!!
    seal.broken = true
    check("a store that cannot be read gives an error, not a new key", fails { VaultKeys(seal, file).vaultKey() })
    check("and the sealed copy is left as it was", before.contentEquals(file.read()) && file.writes == 1)
  }
  run {
    val seal = FakeSeal()
    val file = FakeFile()
    VaultKeys(seal, file).vaultKey()
    val before = file.read()!!
    seal.key = null
    check("a sealed copy whose sealing key is gone gives an error", fails { VaultKeys(seal, file).vaultKey() })
    check("and no new sealing key or vault key is made", seal.made == 1 && before.contentEquals(file.read()))
  }
  run {
    val seal = FakeSeal()
    val file = FakeFile()
    VaultKeys(seal, file).vaultKey()
    val before = file.read()!!
    seal.key = KeyGenerator.getInstance("AES").apply { init(256) }.generateKey()
    check("a sealed copy that does not open gives an error", fails { VaultKeys(seal, file).vaultKey() })
    check("and is never written over", before.contentEquals(file.read()) && file.writes == 1)
    file.sealed = before.copyOf(20)
    check("a cut-short sealed copy gives an error", fails { VaultKeys(seal, file).vaultKey() })
  }
  run {
    val seal = FakeSeal()
    val file = FakeFile().apply { full = true }
    check("a key the store cannot keep is not handed out", fails { VaultKeys(seal, file).vaultKey() })
    file.full = false
    val kept = VaultKeys(seal, file).vaultKey()
    check("and the next ask makes and keeps one", kept.size == 32 && file.writes == 1)
  }
  if (failed > 0) {
    println("$failed keeper check(s) FAILED")
    exitProcess(1)
  }
  println("all keeper checks passed")
}
