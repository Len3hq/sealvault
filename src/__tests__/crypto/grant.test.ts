import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/ipfs", () => ({
  fetchFromIPFS: vi.fn(),
  uploadToIPFS: vi.fn(),
}))

import { fetchFromIPFS } from "@/lib/ipfs"
import type { AccessGrantPayload } from "@/lib/arkiv/types"

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

// Helper: encrypt content, wire up fetchFromIPFS mock, return AccessGrantPayload
async function encryptAndMock(
  content: Uint8Array<ArrayBuffer>,
  token: string
): Promise<AccessGrantPayload> {
  const { ciphertext, grantIv } = await encryptForGrant(content, token)
  vi.mocked(fetchFromIPFS).mockResolvedValueOnce(ciphertext)
  return { grantCID: "QmGrantTest", grantIv }
}

describe("encryptForGrant + decryptGrant", () => {
  it("round-trips text content", async () => {
    const token = generateGrantToken()
    const content = new TextEncoder().encode("confidential record") as Uint8Array<ArrayBuffer>
    const payload = await encryptAndMock(content, token)
    const decrypted = await decryptGrant(payload, token)
    expect(new TextDecoder().decode(decrypted)).toBe("confidential record")
  })

  it("round-trips binary content", async () => {
    const token = generateGrantToken()
    const bytes = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(256))) as Uint8Array<ArrayBuffer>
    const payload = await encryptAndMock(bytes, token)
    const decrypted = await decryptGrant(payload, token)
    expect(Array.from(decrypted)).toEqual(Array.from(bytes))
  })

  it("returns a Uint8Array from decryptGrant", async () => {
    const token = generateGrantToken()
    const content = new TextEncoder().encode("test") as Uint8Array<ArrayBuffer>
    const payload = await encryptAndMock(content, token)
    const decrypted = await decryptGrant(payload, token)
    expect(ArrayBuffer.isView(decrypted)).toBe(true)
  })

  it("EncryptedGrant has ciphertext (Uint8Array) and grantIv fields", async () => {
    const token = generateGrantToken()
    const result = await encryptForGrant(new Uint8Array(new ArrayBuffer(3)).fill(1) as Uint8Array<ArrayBuffer>, token)
    expect(result.ciphertext).toBeInstanceOf(Uint8Array)
    expect(result).toHaveProperty("grantIv")
    expect(result.grantIv).toMatch(/^0x/)
  })

  it("produces unique ciphertext on each call (random IV)", async () => {
    const token = generateGrantToken()
    const content = new TextEncoder().encode("same text") as Uint8Array<ArrayBuffer>
    const p1 = await encryptForGrant(content, token)
    const p2 = await encryptForGrant(content, token)
    expect(Array.from(p1.ciphertext)).not.toEqual(Array.from(p2.ciphertext))
    expect(p1.grantIv).not.toBe(p2.grantIv)
  })

  it("fails to decrypt with a different token", async () => {
    const token1 = generateGrantToken()
    const token2 = generateGrantToken()
    const content = new TextEncoder().encode("secret document") as Uint8Array<ArrayBuffer>
    const payload = await encryptAndMock(content, token1)
    await expect(decryptGrant(payload, token2)).rejects.toThrow()
  })

  it("fails when ciphertext is tampered", async () => {
    const token = generateGrantToken()
    const { grantIv } = await encryptForGrant(new TextEncoder().encode("real") as Uint8Array<ArrayBuffer>, token)
    const tampered = new Uint8Array(new ArrayBuffer(50)).fill(0xff) as Uint8Array<ArrayBuffer>
    vi.mocked(fetchFromIPFS).mockResolvedValueOnce(tampered)
    const payload: AccessGrantPayload = { grantCID: "QmGrantTest", grantIv }
    await expect(decryptGrant(payload, token)).rejects.toThrow()
  })

  it("round-trips a large payload (512 KB)", async () => {
    const token = generateGrantToken()
    const big = makeRandomBytes(512 * 1024) as Uint8Array<ArrayBuffer>
    const payload = await encryptAndMock(big, token)
    const decrypted = await decryptGrant(payload, token)
    expect(decrypted.length).toBe(big.length)
    expect(decrypted[0]).toBe(big[0])
    expect(decrypted[big.length - 1]).toBe(big[big.length - 1])
  })
})
