import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest"
import { createMagicLinkGrant } from "@/lib/vault/grant-flow"
import { encryptVaultItem, decryptGrant } from "@/lib/crypto"
import { deriveMasterKey } from "@/lib/crypto/keys"
import { hashGrantToken } from "@/lib/crypto/grant"
import { GRANT_STATUS } from "@/lib/arkiv/constants"
import type { VaultItemPayload, WalletClient } from "@/lib/arkiv/types"

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/arkiv/mutations", () => ({
  createAccessGrant: vi.fn().mockResolvedValue({ entityKey: "0xGrantKey" }),
  createGrantRecord: vi.fn().mockResolvedValue({ entityKey: "0xRecordKey" }),
}))

// fetchFromIPFS is called by decryptVaultItem (for vault item ciphertext).
// uploadToIPFS is called by createMagicLinkGrant (for grant ciphertext).
vi.mock("@/lib/ipfs", () => ({
  fetchFromIPFS: vi.fn(),
  uploadToIPFS: vi.fn().mockResolvedValue("QmGrantCid"),
}))

import { createAccessGrant, createGrantRecord } from "@/lib/arkiv/mutations"
import { fetchFromIPFS, uploadToIPFS } from "@/lib/ipfs"

// ─── Fixtures ─────────────────────────────────────────────────────────────────

let masterKey: CryptoKey
let vaultItemPayload: VaultItemPayload
let vaultCiphertext: Uint8Array<ArrayBuffer>
const DOCUMENT_CONTENT = "Patient: John Doe\nDiagnosis: Annual checkup — all clear."

function makeMockWalletClient(): WalletClient {
  return {
    createEntity:   vi.fn().mockResolvedValue({ entityKey: "0xEntity", txHash: "0xtx" }),
    updateEntity:   vi.fn().mockResolvedValue(undefined),
    deleteEntity:   vi.fn().mockResolvedValue(undefined),
    mutateEntities: vi.fn().mockResolvedValue({ createdEntities: [], updatedEntities: [], deletedEntities: [], extendedEntities: [], ownershipChanges: [], txHash: "0xtx" }),
    extendEntity:   vi.fn().mockResolvedValue(undefined),
  }
}

const BASE_PARAMS = {
  ownerAddress:    "0xOwner" as const,
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
  // Each test needs fetchFromIPFS to return the vault ciphertext (for decryptVaultItem)
  // and uploadToIPFS to return a fake grant CID (for the grant re-encryption step).
  beforeEach(() => {
    vi.mocked(fetchFromIPFS).mockImplementation(async (cid) => {
      if (cid === "QmVaultCid") return vaultCiphertext
      throw new Error(`Unexpected CID in test: ${cid}`)
    })
    vi.mocked(uploadToIPFS).mockResolvedValue("QmGrantCid")
  })

  it("returns a token, tokenHash, grantEntityKey, and grantRecordKey", async () => {
    const wallet = makeMockWalletClient()
    const result = await createMagicLinkGrant({
      ...BASE_PARAMS,
      vaultItemPayload,
      masterKey,
      walletClient: wallet,
    })

    expect(result).toHaveProperty("token")
    expect(result).toHaveProperty("tokenHash")
    expect(result).toHaveProperty("grantEntityKey")
    expect(result).toHaveProperty("grantRecordKey")
  })

  it("token is a 66-char 0x-prefixed hex string (32 bytes)", async () => {
    const wallet = makeMockWalletClient()
    const { token } = await createMagicLinkGrant({
      ...BASE_PARAMS,
      vaultItemPayload,
      masterKey,
      walletClient: wallet,
    })
    expect(token).toMatch(/^0x[0-9a-f]{64}$/i)
  })

  it("tokenHash matches keccak256(token)", async () => {
    const wallet = makeMockWalletClient()
    const { token, tokenHash } = await createMagicLinkGrant({
      ...BASE_PARAMS,
      vaultItemPayload,
      masterKey,
      walletClient: wallet,
    })
    expect(tokenHash).toBe(hashGrantToken(token))
  })

  it("creates an access grant entity with the token hash and duration", async () => {
    vi.mocked(createAccessGrant).mockClear()
    const wallet = makeMockWalletClient()
    const { tokenHash } = await createMagicLinkGrant({
      ...BASE_PARAMS,
      vaultItemPayload,
      masterKey,
      walletClient: wallet,
    })

    expect(createAccessGrant).toHaveBeenCalledOnce()
    const call = vi.mocked(createAccessGrant).mock.calls[0][1]
    expect(call.tokenHash).toBe(tokenHash)
    expect(call.parentVaultItemKey).toBe(BASE_PARAMS.vaultItemKey)
    expect(call.grantedByAddress).toBe(BASE_PARAMS.ownerAddress)
    expect(call.purpose).toBe(BASE_PARAMS.purpose)
    expect(call.durationSeconds).toBe(BASE_PARAMS.durationSeconds)
  })

  it("creates a grant record with active status and correct links", async () => {
    vi.mocked(createGrantRecord).mockClear()
    vi.mocked(createAccessGrant).mockResolvedValueOnce({ entityKey: "0xSpecificGrantKey" })
    const wallet = makeMockWalletClient()

    await createMagicLinkGrant({
      ...BASE_PARAMS,
      vaultItemPayload,
      masterKey,
      walletClient: wallet,
    })

    expect(createGrantRecord).toHaveBeenCalledOnce()
    const call = vi.mocked(createGrantRecord).mock.calls[0][1]
    expect(call.granteeName).toBe("Dr. Smith")
    expect(call.parentVaultItemKey).toBe(BASE_PARAMS.vaultItemKey)
    expect(call.grantEntityKey).toBe("0xSpecificGrantKey")
    expect(call.status).toBe(GRANT_STATUS.ACTIVE)
    expect(call.category).toBe("medical")
    expect(call.purpose).toBe(BASE_PARAMS.purpose)
    expect(call.durationSeconds).toBe(BASE_PARAMS.durationSeconds)
  })

  it("embeds label and fileType in the grant payload", async () => {
    vi.mocked(createAccessGrant).mockClear()
    const wallet = makeMockWalletClient()

    await createMagicLinkGrant({
      ...BASE_PARAMS,
      vaultItemPayload,
      masterKey,
      walletClient: wallet,
    })

    const call = vi.mocked(createAccessGrant).mock.calls[0][1]
    expect(call.accessGrantPayload.label).toBe("Blood Work 2026")
    expect(call.accessGrantPayload.fileType).toBe("text/plain")
  })

  it("grantEntityKey and grantRecordKey match what the mutations return", async () => {
    vi.mocked(createAccessGrant).mockResolvedValueOnce({ entityKey: "0xGrantABC" })
    vi.mocked(createGrantRecord).mockResolvedValueOnce({ entityKey: "0xRecordXYZ" })
    const wallet = makeMockWalletClient()

    const result = await createMagicLinkGrant({
      ...BASE_PARAMS,
      vaultItemPayload,
      masterKey,
      walletClient: wallet,
    })

    expect(result.grantEntityKey).toBe("0xGrantABC")
    expect(result.grantRecordKey).toBe("0xRecordXYZ")
  })

  it("end-to-end: token from result can decrypt the grant payload", async () => {
    vi.mocked(createAccessGrant).mockClear()
    // Capture the grant ciphertext uploaded to IPFS so decryptGrant can use it
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

    const wallet = makeMockWalletClient()
    const { token } = await createMagicLinkGrant({
      ...BASE_PARAMS,
      vaultItemPayload,
      masterKey,
      walletClient: wallet,
    })

    const grantPayload = vi.mocked(createAccessGrant).mock.calls[0][1].accessGrantPayload
    const decrypted = await decryptGrant(grantPayload, token)
    expect(new TextDecoder().decode(decrypted)).toBe(DOCUMENT_CONTENT)
  })

  it("different calls produce different tokens", async () => {
    const wallet = makeMockWalletClient()
    const [r1, r2] = await Promise.all([
      createMagicLinkGrant({ ...BASE_PARAMS, vaultItemPayload, masterKey, walletClient: wallet }),
      createMagicLinkGrant({ ...BASE_PARAMS, vaultItemPayload, masterKey, walletClient: wallet }),
    ])
    expect(r1.token).not.toBe(r2.token)
    expect(r1.tokenHash).not.toBe(r2.tokenHash)
  })

  it("throws when walletClient createAccessGrant rejects", async () => {
    vi.mocked(createAccessGrant).mockRejectedValueOnce(new Error("Arkiv write failed"))
    const wallet = makeMockWalletClient()

    await expect(
      createMagicLinkGrant({
        ...BASE_PARAMS,
        vaultItemPayload,
        masterKey,
        walletClient: wallet,
      })
    ).rejects.toThrow("Arkiv write failed")
  })
})
