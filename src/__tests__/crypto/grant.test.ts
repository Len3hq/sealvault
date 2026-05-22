import { describe, it, expect } from "vitest"

function makeRandomBytes(size: number) {
  const buf = new Uint8Array(new ArrayBuffer(size))
  for (let i = 0; i < size; i += 65536) {
    crypto.getRandomValues(buf.subarray(i, i + 65536))
  }
  return buf
}

import {
  generateGrantToken,
  hashGrantToken,
  encryptForGrant,
  decryptGrant,
} from "@/lib/crypto/grant"

// ─── generateGrantToken ───────────────────────────────────────────────────────

describe("generateGrantToken", () => {
  it("returns a 0x-prefixed hex string", () => {
    const token = generateGrantToken()
    expect(token).toMatch(/^0x[0-9a-f]+$/i)
  })

  it("is 66 characters long (0x + 64 hex chars = 32 bytes)", () => {
    const token = generateGrantToken()
    expect(token.length).toBe(66)
  })

  it("generates unique tokens each call", () => {
    const tokens = Array.from({ length: 10 }, generateGrantToken)
    const unique = new Set(tokens)
    expect(unique.size).toBe(10)
  })
})

// ─── hashGrantToken ───────────────────────────────────────────────────────────

describe("hashGrantToken", () => {
  it("returns a 0x-prefixed keccak256 hash", () => {
    const token = generateGrantToken()
    const hash = hashGrantToken(token)
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/i)
  })

  it("is deterministic — same token → same hash", () => {
    const token = generateGrantToken()
    expect(hashGrantToken(token)).toBe(hashGrantToken(token))
  })

  it("produces different hashes for different tokens", () => {
    const t1 = generateGrantToken()
    const t2 = generateGrantToken()
    expect(hashGrantToken(t1)).not.toBe(hashGrantToken(t2))
  })

  it("accepts token without 0x prefix", () => {
    const token = generateGrantToken()
    const withPrefix = hashGrantToken(token)
    const withoutPrefix = hashGrantToken(token.slice(2))
    expect(withPrefix).toBe(withoutPrefix)
  })
})

// ─── encryptForGrant / decryptGrant round-trip ────────────────────────────────

describe("encryptForGrant + decryptGrant", () => {
  it("round-trips text content", async () => {
    const token = generateGrantToken()
    const content = new TextEncoder().encode("confidential record")
    const payload = await encryptForGrant(content, token)
    const decrypted = await decryptGrant(payload, token)
    expect(new TextDecoder().decode(decrypted)).toBe("confidential record")
  })

  it("round-trips binary content", async () => {
    const token = generateGrantToken()
    const bytes = crypto.getRandomValues(new Uint8Array(256))
    const payload = await encryptForGrant(bytes, token)
    const decrypted = await decryptGrant(payload, token)
    expect(Array.from(decrypted)).toEqual(Array.from(bytes))
  })

  it("returns a Uint8Array from decryptGrant", async () => {
    const token = generateGrantToken()
    const content = new TextEncoder().encode("test")
    const payload = await encryptForGrant(content, token)
    const decrypted = await decryptGrant(payload, token)
    expect(ArrayBuffer.isView(decrypted)).toBe(true)
  })

  it("payload has grantCiphertext and grantIv fields", async () => {
    const token = generateGrantToken()
    const payload = await encryptForGrant(new Uint8Array([1, 2, 3]), token)
    expect(payload).toHaveProperty("grantCiphertext")
    expect(payload).toHaveProperty("grantIv")
    expect(payload.grantCiphertext).toMatch(/^0x/)
    expect(payload.grantIv).toMatch(/^0x/)
  })

  it("produces unique ciphertext on each call (random IV)", async () => {
    const token = generateGrantToken()
    const content = new TextEncoder().encode("same text")
    const p1 = await encryptForGrant(content, token)
    const p2 = await encryptForGrant(content, token)
    expect(p1.grantCiphertext).not.toBe(p2.grantCiphertext)
    expect(p1.grantIv).not.toBe(p2.grantIv)
  })

  it("fails to decrypt with a different token", async () => {
    const token1 = generateGrantToken()
    const token2 = generateGrantToken()
    const content = new TextEncoder().encode("secret document")
    const payload = await encryptForGrant(content, token1)
    await expect(decryptGrant(payload, token2)).rejects.toThrow()
  })

  it("fails when ciphertext is tampered", async () => {
    const token = generateGrantToken()
    const payload = await encryptForGrant(new TextEncoder().encode("real"), token)
    const tampered = { ...payload, grantCiphertext: "0x" + "ff".repeat(50) }
    await expect(decryptGrant(tampered, token)).rejects.toThrow()
  })

  it("round-trips a large payload (512 KB)", async () => {
    const token = generateGrantToken()
    const big = makeRandomBytes(512 * 1024)
    const payload = await encryptForGrant(big, token)
    const decrypted = await decryptGrant(payload, token)
    expect(decrypted.length).toBe(big.length)
    expect(decrypted[0]).toBe(big[0])
    expect(decrypted[big.length - 1]).toBe(big[big.length - 1])
  })
})
