import { describe, it, expect, beforeAll } from "vitest"
import { encryptVaultItem, decryptVaultItem } from "@/lib/crypto/vault"
import { deriveMasterKey } from "@/lib/crypto/keys"

function makeRandomBytes(size: number) {
  const buf = new Uint8Array(new ArrayBuffer(size))
  for (let i = 0; i < size; i += 65536) {
    crypto.getRandomValues(buf.subarray(i, i + 65536))
  }
  return buf
}

// ─── Shared key ───────────────────────────────────────────────────────────────

let masterKey: CryptoKey
let wrongKey: CryptoKey

beforeAll(async () => {
  masterKey = await deriveMasterKey("0x" + "cc".repeat(65))
  wrongKey  = await deriveMasterKey("0x" + "dd".repeat(65))
})

// ─── encryptVaultItem ─────────────────────────────────────────────────────────

describe("encryptVaultItem", () => {
  it("returns a VaultItemPayload object", async () => {
    const result = await encryptVaultItem("hello world", masterKey)
    expect(result).toHaveProperty("ciphertext")
    expect(result).toHaveProperty("iv")
    expect(result).toHaveProperty("wrappedItemKey")
    expect(result).toHaveProperty("wrapIv")
    expect(result).toHaveProperty("version", 1)
  })

  it("all hex fields start with 0x", async () => {
    const result = await encryptVaultItem("test", masterKey)
    expect(result.ciphertext).toMatch(/^0x/)
    expect(result.iv).toMatch(/^0x/)
    expect(result.wrappedItemKey).toMatch(/^0x/)
    expect(result.wrapIv).toMatch(/^0x/)
  })

  it("produces unique IVs on each call (random)", async () => {
    const r1 = await encryptVaultItem("same content", masterKey)
    const r2 = await encryptVaultItem("same content", masterKey)
    expect(r1.iv).not.toBe(r2.iv)
    expect(r1.wrapIv).not.toBe(r2.wrapIv)
  })

  it("produces unique ciphertext on each call", async () => {
    const r1 = await encryptVaultItem("same content", masterKey)
    const r2 = await encryptVaultItem("same content", masterKey)
    expect(r1.ciphertext).not.toBe(r2.ciphertext)
  })

  it("accepts an ArrayBuffer input", async () => {
    const buf = new TextEncoder().encode("from buffer").buffer
    const result = await encryptVaultItem(buf, masterKey)
    expect(result.ciphertext).toMatch(/^0x/)
  })

  it("accepts an empty string", async () => {
    const result = await encryptVaultItem("", masterKey)
    expect(result.ciphertext).toMatch(/^0x/)
  })
})

// ─── decryptVaultItem ─────────────────────────────────────────────────────────

describe("decryptVaultItem", () => {
  it("round-trips a string value", async () => {
    const original = "Blood Work 2026 — confidential"
    const payload = await encryptVaultItem(original, masterKey)
    const decrypted = await decryptVaultItem(payload, masterKey)
    expect(new TextDecoder().decode(decrypted)).toBe(original)
  })

  it("round-trips binary content (ArrayBuffer)", async () => {
    const bytes = crypto.getRandomValues(new Uint8Array(512))
    const payload = await encryptVaultItem(bytes.buffer, masterKey)
    const decrypted = await decryptVaultItem(payload, masterKey)
    expect(Array.from(decrypted)).toEqual(Array.from(bytes))
  })

  it("returns a Uint8Array", async () => {
    const payload = await encryptVaultItem("hi", masterKey)
    const decrypted = await decryptVaultItem(payload, masterKey)
    expect(ArrayBuffer.isView(decrypted)).toBe(true)
  })

  it("round-trips an empty string", async () => {
    const payload = await encryptVaultItem("", masterKey)
    const decrypted = await decryptVaultItem(payload, masterKey)
    expect(new TextDecoder().decode(decrypted)).toBe("")
  })

  it("round-trips a large payload (1 MB)", async () => {
    const big = makeRandomBytes(1024 * 1024)
    const payload = await encryptVaultItem(big.buffer, masterKey)
    const decrypted = await decryptVaultItem(payload, masterKey)
    expect(decrypted.length).toBe(big.length)
    // Spot-check first and last bytes
    expect(decrypted[0]).toBe(big[0])
    expect(decrypted[big.length - 1]).toBe(big[big.length - 1])
  })

  it("throws when decrypted with the wrong master key", async () => {
    const payload = await encryptVaultItem("secret", masterKey)
    await expect(decryptVaultItem(payload, wrongKey)).rejects.toThrow()
  })

  it("throws when ciphertext is tampered", async () => {
    const payload = await encryptVaultItem("secret", masterKey)
    const tampered = { ...payload, ciphertext: "0x" + "ff".repeat(50) }
    await expect(decryptVaultItem(tampered, masterKey)).rejects.toThrow()
  })
})
