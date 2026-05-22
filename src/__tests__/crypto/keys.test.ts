import { describe, it, expect } from "vitest"
import { hexToBytes, bufToHex, deriveMasterKey } from "@/lib/crypto/keys"

// ─── hexToBytes ───────────────────────────────────────────────────────────────

describe("hexToBytes", () => {
  it("converts a plain hex string to bytes", () => {
    const bytes = hexToBytes("deadbeef")
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(Array.from(bytes)).toEqual([0xde, 0xad, 0xbe, 0xef])
  })

  it("strips leading 0x prefix", () => {
    const bytes = hexToBytes("0xdeadbeef")
    expect(Array.from(bytes)).toEqual([0xde, 0xad, 0xbe, 0xef])
  })

  it("handles all-zero bytes", () => {
    const bytes = hexToBytes("0000")
    expect(Array.from(bytes)).toEqual([0, 0])
  })

  it("handles full 32-byte value", () => {
    const hex = "0x" + "ab".repeat(32)
    const bytes = hexToBytes(hex)
    expect(bytes.length).toBe(32)
    expect(bytes[0]).toBe(0xab)
    expect(bytes[31]).toBe(0xab)
  })

  it("throws on odd-length hex string", () => {
    expect(() => hexToBytes("abc")).toThrow()
  })
})

// ─── bufToHex ─────────────────────────────────────────────────────────────────

describe("bufToHex", () => {
  it("converts Uint8Array to 0x-prefixed hex", () => {
    const hex = bufToHex(new Uint8Array([0xde, 0xad, 0xbe, 0xef]))
    expect(hex).toBe("0xdeadbeef")
  })

  it("converts ArrayBuffer to hex", () => {
    const buf = new Uint8Array([0x01, 0x02, 0x03]).buffer
    expect(bufToHex(buf)).toBe("0x010203")
  })

  it("pads single-digit bytes with leading zero", () => {
    const hex = bufToHex(new Uint8Array([0x00, 0x0f, 0xff]))
    expect(hex).toBe("0x000fff")
  })

  it("always starts with 0x", () => {
    expect(bufToHex(new Uint8Array([1]))).toMatch(/^0x/)
  })
})

// ─── hexToBytes / bufToHex round-trip ─────────────────────────────────────────

describe("hexToBytes / bufToHex round-trip", () => {
  it("is a perfect inverse for random bytes", () => {
    const original = crypto.getRandomValues(new Uint8Array(32))
    const hex = bufToHex(original)
    const restored = hexToBytes(hex)
    expect(Array.from(restored)).toEqual(Array.from(original))
  })

  it("is a perfect inverse for a known hex string", () => {
    const hex = "0xcafebabe00112233"
    expect(bufToHex(hexToBytes(hex))).toBe(hex)
  })
})

// ─── deriveMasterKey ──────────────────────────────────────────────────────────

describe("deriveMasterKey", () => {
  const fakeSignature =
    "0x" + "a1".repeat(65) // 65-byte mock signature, hex-encoded

  it("returns a CryptoKey", async () => {
    const key = await deriveMasterKey(fakeSignature)
    expect(key).toBeInstanceOf(CryptoKey)
  })

  it("returns an AES-GCM key", async () => {
    const key = await deriveMasterKey(fakeSignature)
    expect(key.algorithm.name).toBe("AES-GCM")
  })

  it("key is 256-bit", async () => {
    const key = await deriveMasterKey(fakeSignature)
    expect((key.algorithm as AesKeyAlgorithm).length).toBe(256)
  })

  it("key is not extractable (stays in memory only)", async () => {
    const key = await deriveMasterKey(fakeSignature)
    expect(key.extractable).toBe(false)
  })

  it("key has encrypt, decrypt, wrapKey, unwrapKey usages", async () => {
    const key = await deriveMasterKey(fakeSignature)
    expect(key.usages).toContain("encrypt")
    expect(key.usages).toContain("decrypt")
    expect(key.usages).toContain("wrapKey")
    expect(key.usages).toContain("unwrapKey")
  })

  it("same signature produces a functionally identical key", async () => {
    const key1 = await deriveMasterKey(fakeSignature)
    const key2 = await deriveMasterKey(fakeSignature)
    // Can't compare CryptoKey objects directly — verify by encrypt/decrypt cross-use
    const iv = new Uint8Array(12)
    const plaintext = new TextEncoder().encode("hello")
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key1, plaintext)
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key2, ciphertext)
    expect(new TextDecoder().decode(decrypted)).toBe("hello")
  })

  it("different signatures produce different keys", async () => {
    const key1 = await deriveMasterKey("0x" + "aa".repeat(65))
    const key2 = await deriveMasterKey("0x" + "bb".repeat(65))
    const iv = new Uint8Array(12)
    const plaintext = new TextEncoder().encode("secret")
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key1, plaintext)
    await expect(
      crypto.subtle.decrypt({ name: "AES-GCM", iv }, key2, ciphertext)
    ).rejects.toThrow()
  })

  it("accepts signature without 0x prefix", async () => {
    const raw = "a1".repeat(65)
    const key = await deriveMasterKey(raw)
    expect(key).toBeInstanceOf(CryptoKey)
  })
})
