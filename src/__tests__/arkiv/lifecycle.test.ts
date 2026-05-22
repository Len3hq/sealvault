import { describe, it, expect, vi, beforeEach } from "vitest"
import { deleteVaultItemWithGrants, handleGrantExpiry } from "@/lib/arkiv/mutations/lifecycle"
import { GRANT_STATUS } from "@/lib/arkiv/constants"
import type { Entity } from "@arkiv-network/sdk"

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("@/lib/arkiv/queries/access-grants", () => ({
  queryGrantsByVaultItem: vi.fn(),
}))

vi.mock("@/lib/arkiv/queries/agent-memory", () => ({
  queryGrantRecordByGrantEntity: vi.fn(),
}))

vi.mock("@/lib/arkiv/mutations/access-grants", () => ({
  updateGrantRecordStatus: vi.fn(),
}))

import { queryGrantsByVaultItem } from "@/lib/arkiv/queries/access-grants"
import { queryGrantRecordByGrantEntity } from "@/lib/arkiv/queries/agent-memory"
import { updateGrantRecordStatus } from "@/lib/arkiv/mutations/access-grants"

// ─── Fixtures ────────────────────────────────────────────────────────────────

const mockPublicClient = {} as Parameters<typeof deleteVaultItemWithGrants>[0]

function makeMockWalletClient() {
  return {
    createEntity:    vi.fn().mockResolvedValue({ entityKey: "0xnew", txHash: "0x" }),
    updateEntity:    vi.fn().mockResolvedValue(undefined),
    deleteEntity:    vi.fn().mockResolvedValue(undefined),
    mutateEntities:  vi.fn().mockResolvedValue({ createdEntities: [], updatedEntities: [], deletedEntities: [], extendedEntities: [], ownershipChanges: [], txHash: "0x" }),
    extendEntity:    vi.fn().mockResolvedValue(undefined),
  }
}

const OWNER           = "0xOwnerAddress"
const VAULT_ITEM_KEY  = "0xVaultItemKey"

// Minimal Entity mock with the fields our lifecycle code accesses
function makeEntity(key: string, hasPayload = true): Partial<Entity> {
  return {
    key: key as `0x${string}`,
    payload: hasPayload
      ? new TextEncoder().encode(JSON.stringify({ summary: "test", context: "ctx", outcome: null }))
      : undefined,
    attributes: [
      { key: "status",     value: "active" },
      { key: "expires_at", value: Date.now() + 86400000 },
    ],
    contentType: "application/json",
  }
}

const mockGrant        = makeEntity("0xGrantKey1")
const mockGrant2       = makeEntity("0xGrantKey2")
const mockMemoryRecord = makeEntity("0xMemoryKey1")

// Simulate QueryResult shape (only .entities is used)
function queryResult(entities: Partial<Entity>[]) {
  return { entities } as never
}

// ─── deleteVaultItemWithGrants ────────────────────────────────────────────────

describe("deleteVaultItemWithGrants", () => {
  beforeEach(() => vi.clearAllMocks())

  it("queries child grants by vault item key", async () => {
    vi.mocked(queryGrantsByVaultItem).mockResolvedValue(queryResult([]))

    await deleteVaultItemWithGrants(mockPublicClient, makeMockWalletClient(), VAULT_ITEM_KEY, OWNER)

    expect(queryGrantsByVaultItem).toHaveBeenCalledWith(mockPublicClient, VAULT_ITEM_KEY, OWNER)
  })

  it("deletes the vault item when there are no child grants", async () => {
    vi.mocked(queryGrantsByVaultItem).mockResolvedValue(queryResult([]))
    const wallet = makeMockWalletClient()

    const result = await deleteVaultItemWithGrants(mockPublicClient, wallet, VAULT_ITEM_KEY, OWNER)

    expect(wallet.deleteEntity).toHaveBeenCalledWith({ entityKey: VAULT_ITEM_KEY })
    expect(wallet.deleteEntity).toHaveBeenCalledTimes(1)
    expect(result.deletedGrants).toBe(0)
  })

  it("deletes vault item AND all child grants", async () => {
    vi.mocked(queryGrantsByVaultItem).mockResolvedValue(queryResult([mockGrant, mockGrant2]))
    vi.mocked(queryGrantRecordByGrantEntity).mockResolvedValue(null)
    const wallet = makeMockWalletClient()

    const result = await deleteVaultItemWithGrants(mockPublicClient, wallet, VAULT_ITEM_KEY, OWNER)

    expect(wallet.deleteEntity).toHaveBeenCalledWith({ entityKey: VAULT_ITEM_KEY })
    expect(wallet.deleteEntity).toHaveBeenCalledWith({ entityKey: "0xGrantKey1" })
    expect(wallet.deleteEntity).toHaveBeenCalledWith({ entityKey: "0xGrantKey2" })
    expect(wallet.deleteEntity).toHaveBeenCalledTimes(3)
    expect(result.deletedGrants).toBe(2)
  })

  it("marks memory records as revoked for each child grant", async () => {
    vi.mocked(queryGrantsByVaultItem).mockResolvedValue(queryResult([mockGrant]))
    vi.mocked(queryGrantRecordByGrantEntity).mockResolvedValue(mockMemoryRecord as never)
    vi.mocked(updateGrantRecordStatus).mockResolvedValue(undefined)
    const wallet = makeMockWalletClient()

    await deleteVaultItemWithGrants(mockPublicClient, wallet, VAULT_ITEM_KEY, OWNER)

    expect(updateGrantRecordStatus).toHaveBeenCalledWith(
      wallet,
      mockMemoryRecord,
      GRANT_STATUS.REVOKED,
      "Parent document deleted"
    )
  })

  it("skips memory update when no memory record exists", async () => {
    vi.mocked(queryGrantsByVaultItem).mockResolvedValue(queryResult([mockGrant]))
    vi.mocked(queryGrantRecordByGrantEntity).mockResolvedValue(null)
    const wallet = makeMockWalletClient()

    await deleteVaultItemWithGrants(mockPublicClient, wallet, VAULT_ITEM_KEY, OWNER)

    expect(updateGrantRecordStatus).not.toHaveBeenCalled()
    expect(wallet.deleteEntity).toHaveBeenCalledTimes(2) // item + grant
  })
})

// ─── handleGrantExpiry ────────────────────────────────────────────────────────

describe("handleGrantExpiry", () => {
  const GRANT_KEY = "0xExpiredGrant"

  beforeEach(() => vi.clearAllMocks())

  it("updates memory record status to expired", async () => {
    vi.mocked(queryGrantRecordByGrantEntity).mockResolvedValue(mockMemoryRecord as never)
    vi.mocked(updateGrantRecordStatus).mockResolvedValue(undefined)
    const wallet = makeMockWalletClient()

    await handleGrantExpiry(mockPublicClient, wallet, GRANT_KEY, OWNER)

    expect(updateGrantRecordStatus).toHaveBeenCalledWith(
      wallet,
      mockMemoryRecord,
      GRANT_STATUS.EXPIRED,
      "Expired automatically"
    )
  })

  it("does nothing when no memory record exists", async () => {
    vi.mocked(queryGrantRecordByGrantEntity).mockResolvedValue(null)
    const wallet = makeMockWalletClient()

    await handleGrantExpiry(mockPublicClient, wallet, GRANT_KEY, OWNER)

    expect(updateGrantRecordStatus).not.toHaveBeenCalled()
  })

  it("queries by the correct grant entity key and owner", async () => {
    vi.mocked(queryGrantRecordByGrantEntity).mockResolvedValue(null)

    await handleGrantExpiry(mockPublicClient, makeMockWalletClient(), GRANT_KEY, OWNER)

    expect(queryGrantRecordByGrantEntity).toHaveBeenCalledWith(mockPublicClient, GRANT_KEY, OWNER)
  })

  it("does nothing when memory record has no payload", async () => {
    const entityNoPayload = makeEntity("0xKey", false)
    vi.mocked(queryGrantRecordByGrantEntity).mockResolvedValue(entityNoPayload as never)
    const wallet = makeMockWalletClient()

    await handleGrantExpiry(mockPublicClient, wallet, GRANT_KEY, OWNER)

    expect(updateGrantRecordStatus).not.toHaveBeenCalled()
  })
})
