import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest"
import { createMagicLinkGrant } from "@/lib/vault/grant-flow"
import { encryptVaultItem, decryptGrant } from "@/lib/crypto"
import { deriveMasterKey } from "@/lib/crypto/keys"
import { hashGrantToken } from "@/lib/crypto/grant"
import type { VaultItemPayload } from "@/lib/arkiv/types"

// ─── Mocks ────────────────────────────────────────────────────────────────────

// fetchFromIPFS is called by decryptVaultItem (for vault item ciphertext).
// uploadToIPFS is called by createMagicLinkGrant (for grant ciphertext).
vi.mock("@/lib/ipfs", () => ({
  fetchFromIPFS: vi.fn(),
  uploadToIPFS: vi.fn().mockResolvedValue("QmGrantCid"),
}))

// relayPost replaces the direct Arkiv SDK writes (server handles them)
vi.mock("@/lib/relay", () => ({
  relayPost: vi.fn().mockResolvedValue({
    grantEntityKey: "0xGrantKey",
    grantRecordKey: "0xRecordKey",
  }),
  relayDelete: vi.fn(),
  relayPatch: vi.fn(),
}))

import { fetchFromIPFS, uploadToIPFS } from "@/lib/ipfs"
import { relayPost } from "@/lib/relay"

// ─── Fixtures ─────────────────────────────────────────────────────────────────

let masterKey: CryptoKey
let vaultItemPayload: VaultItemPayload
let vaultCiphertext: Uint8Array<ArrayBuffer>
const DOCUMENT_CONTENT = "Patient: John Doe\nDiagnosis: Annual checkup — all clear."

const BASE_PARAMS = {
  ownerAddress:    "0xOwner" as const,
  signature:       "0xSig" as const,
  vaultItemKey:    "0xVaultItem",
  label:           "Blood Work 2026",
  fileType:        "text/plain",
  category:        "medical" as const,
  granteeName:     "Dr. Smith",
  purpose:         "Annual specialist consultation",
  durationSeconds: 172_800, // 48h
}

beforeAll(async () => {
  masterKey = await deriveMasterKey("0x" + "ee".repeat(65))
  const { ciphertext, ...keyMaterial } = await encryptVaultItem(DOCUMENT_CONTENT, masterKey)
  vaultCiphertext = ciphertext
  vaultItemPayload = { cid: "QmVaultCid", ...keyMaterial }
})

// ─── createMagicLinkGrant ─────────────────────────────────────────────────────

describe("createMagicLinkGrant", () => {
  beforeEach(() => {
    vi.mocked(fetchFromIPFS).mockImplementation(async (cid) => {
      if (cid === "QmVaultCid") return vaultCiphertext
      throw new Error(`Unexpected CID in test: ${cid}`)
    })
    vi.mocked(uploadToIPFS).mockResolvedValue("QmGrantCid")
    vi.mocked(relayPost).mockResolvedValue({
      grantEntityKey: "0xGrantKey",
      grantRecordKey: "0xRecordKey",
    })
  })

  it("returns a token, tokenHash, grantEntityKey, and grantRecordKey", async () => {
    const result = await createMagicLinkGrant({ ...BASE_PARAMS, vaultItemPayload, masterKey })

    expect(result).toHaveProperty("token")
    expect(result).toHaveProperty("tokenHash")
    expect(result).toHaveProperty("grantEntityKey")
    expect(result).toHaveProperty("grantRecordKey")
  })

  it("token is a 66-char 0x-prefixed hex string (32 bytes)", async () => {
    const { token } = await createMagicLinkGrant({ ...BASE_PARAMS, vaultItemPayload, masterKey })
    expect(token).toMatch(/^0x[0-9a-f]{64}$/i)
  })

  it("tokenHash matches keccak256(token)", async () => {
    const { token, tokenHash } = await createMagicLinkGrant({ ...BASE_PARAMS, vaultItemPayload, masterKey })
    expect(tokenHash).toBe(hashGrantToken(token))
  })

  it("calls relay with correct grant params", async () => {
    vi.mocked(relayPost).mockClear()
    const { tokenHash } = await createMagicLinkGrant({ ...BASE_PARAMS, vaultItemPayload, masterKey })

    expect(relayPost).toHaveBeenCalledOnce()
    const [endpoint, body, ownerAddress, signature] = vi.mocked(relayPost).mock.calls[0]
    expect(endpoint).toBe("/api/relay/grant")
    expect(body).toMatchObject({
      tokenHash,
      parentVaultItemKey: BASE_PARAMS.vaultItemKey,
      purpose: BASE_PARAMS.purpose,
      durationSeconds: BASE_PARAMS.durationSeconds,
      granteeName: BASE_PARAMS.granteeName,
      category: BASE_PARAMS.category,
    })
    expect(ownerAddress).toBe(BASE_PARAMS.ownerAddress)
    expect(signature).toBe(BASE_PARAMS.signature)
  })

  it("embeds label and fileType in the access grant payload sent to relay", async () => {
    vi.mocked(relayPost).mockClear()
    await createMagicLinkGrant({ ...BASE_PARAMS, vaultItemPayload, masterKey })

    const [, body] = vi.mocked(relayPost).mock.calls[0]
    const payload = (body as { accessGrantPayload: { label: string; fileType: string } }).accessGrantPayload
    expect(payload.label).toBe("Blood Work 2026")
    expect(payload.fileType).toBe("text/plain")
  })

  it("grantEntityKey and grantRecordKey come from relay response", async () => {
    vi.mocked(relayPost).mockResolvedValueOnce({
      grantEntityKey: "0xGrantABC",
      grantRecordKey: "0xRecordXYZ",
    })

    const result = await createMagicLinkGrant({ ...BASE_PARAMS, vaultItemPayload, masterKey })

    expect(result.grantEntityKey).toBe("0xGrantABC")
    expect(result.grantRecordKey).toBe("0xRecordXYZ")
  })

  it("end-to-end: token from result can decrypt the grant payload", async () => {
    let capturedGrantBytes: Uint8Array<ArrayBuffer> | undefined
    vi.mocked(uploadToIPFS).mockImplementationOnce(async (bytes) => {
      capturedGrantBytes = bytes
      return "QmGrantCid"
    })
    vi.mocked(fetchFromIPFS).mockImplementation(async (cid) => {
      if (cid === "QmVaultCid") return vaultCiphertext
      if (cid === "QmGrantCid" && capturedGrantBytes) return capturedGrantBytes
      throw new Error(`Unexpected CID: ${cid}`)
    })

    // Capture the accessGrantPayload sent to relay
    let capturedGrantPayload: { grantCID: string; grantIv: string } | undefined
    vi.mocked(relayPost).mockImplementationOnce(async (_endpoint, body) => {
      capturedGrantPayload = (body as { accessGrantPayload: { grantCID: string; grantIv: string } }).accessGrantPayload
      return { grantEntityKey: "0xGrant", grantRecordKey: "0xRecord" }
    })

    const { token } = await createMagicLinkGrant({ ...BASE_PARAMS, vaultItemPayload, masterKey })

    expect(capturedGrantPayload).toBeDefined()
    const decrypted = await decryptGrant(capturedGrantPayload!, token)
    expect(new TextDecoder().decode(decrypted)).toBe(DOCUMENT_CONTENT)
  })

  it("different calls produce different tokens", async () => {
    const [r1, r2] = await Promise.all([
      createMagicLinkGrant({ ...BASE_PARAMS, vaultItemPayload, masterKey }),
      createMagicLinkGrant({ ...BASE_PARAMS, vaultItemPayload, masterKey }),
    ])
    expect(r1.token).not.toBe(r2.token)
    expect(r1.tokenHash).not.toBe(r2.tokenHash)
  })

  it("throws when relay rejects", async () => {
    vi.mocked(relayPost).mockRejectedValueOnce(new Error("Relay failed"))

    await expect(
      createMagicLinkGrant({ ...BASE_PARAMS, vaultItemPayload, masterKey })
    ).rejects.toThrow("Relay failed")
  })
})
