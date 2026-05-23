import { describe, it, expect } from "vitest"
import {
  buildVaultItemEntity,
  buildAccessGrantEntity,
  buildGrantRecordEntity,
  buildConversationMemoryEntity,
} from "@/lib/arkiv/schemas"
import {
  PROJECT_ATTRIBUTE,
  ENTITY_TYPES,
  ENTITY_SUBTYPES,
  TTL,
} from "@/lib/arkiv/constants"

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getAttr(
  attributes: Array<{ key: string; value: string | number }>,
  key: string
): string | number | undefined {
  return attributes.find((a) => a.key === key)?.value
}

function decodePayload(payload: Uint8Array): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(payload))
}

const mockEncryptedPayload = {
  cid: "QmTestCid1234567890abcdef",
  iv: "0xdeadbeef",
  wrappedItemKey: "0xcafe",
  wrapIv: "0xfeed",
  version: 1,
}

// ─── Vault Item ───────────────────────────────────────────────────────────────

describe("buildVaultItemEntity", () => {
  const params = {
    encryptedPayload: mockEncryptedPayload,
    label: "Blood Work 2026",
    category: "medical" as const,
    fileType: "pdf",
    sizeBytes: 204800,
    ownerAddress: "0xOwner",
  }

  const entity = buildVaultItemEntity(params)

  it("sets contentType to application/json", () => {
    expect(entity.contentType).toBe("application/json")
  })

  it("sets expiresIn to 10-year TTL", () => {
    expect(entity.expiresIn).toBe(TTL.VAULT_ITEM)
  })

  it("payload is a binary buffer (Uint8Array)", () => {
    expect(ArrayBuffer.isView(entity.payload)).toBe(true)
  })

  it("includes project attribute with correct value", () => {
    expect(getAttr(entity.attributes, "project")).toBe(PROJECT_ATTRIBUTE)
  })

  it("includes type attribute as vault_item", () => {
    expect(getAttr(entity.attributes, "type")).toBe(ENTITY_TYPES.VAULT_ITEM)
  })

  it("includes category attribute", () => {
    expect(getAttr(entity.attributes, "category")).toBe("medical")
  })

  it("includes label attribute", () => {
    expect(getAttr(entity.attributes, "label")).toBe("Blood Work 2026")
  })

  it("includes file_type attribute", () => {
    expect(getAttr(entity.attributes, "file_type")).toBe("pdf")
  })

  it("includes created_at as a numeric timestamp", () => {
    const createdAt = getAttr(entity.attributes, "created_at")
    expect(typeof createdAt).toBe("number")
    expect(createdAt as number).toBeGreaterThan(0)
  })

  it("includes size_bytes as a number", () => {
    expect(getAttr(entity.attributes, "size_bytes")).toBe(204800)
  })

  it("serialises the encrypted payload into the payload bytes", () => {
    const parsed = decodePayload(entity.payload)
    expect(parsed.cid).toBe("QmTestCid1234567890abcdef")
    expect(parsed.iv).toBe("0xdeadbeef")
    expect(parsed.wrappedItemKey).toBe("0xcafe")
    expect(parsed.version).toBe(1)
  })

  it("has exactly 8 attributes", () => {
    expect(entity.attributes).toHaveLength(8)
  })
})

// ─── Access Grant ─────────────────────────────────────────────────────────────

describe("buildAccessGrantEntity", () => {
  const params = {
    accessGrantPayload: {
      grantCID: "QmGrantCid5678abcdef",
      grantIv: "0xgrantiv",
    },
    tokenHash: "0xtokenhash",
    parentVaultItemKey: "0xparentkey",
    grantedByAddress: "0xowner",
    purpose: "Annual checkup",
    durationSeconds: 172800, // 48h
    label: "Medical Report",
    granteeName: "Dr. Osei",
  }

  const entity = buildAccessGrantEntity(params)

  it("sets expiresIn to durationSeconds (TTL = revocation)", () => {
    expect(entity.expiresIn).toBe(172800)
  })

  it("payload is a Uint8Array", () => {
    expect(ArrayBuffer.isView(entity.payload)).toBe(true)
  })

  it("includes project attribute", () => {
    expect(getAttr(entity.attributes, "project")).toBe(PROJECT_ATTRIBUTE)
  })

  it("includes type as access_grant", () => {
    expect(getAttr(entity.attributes, "type")).toBe(ENTITY_TYPES.ACCESS_GRANT)
  })

  it("includes token_hash for magic link lookup", () => {
    expect(getAttr(entity.attributes, "token_hash")).toBe("0xtokenhash")
  })

  it("includes parent_key linking to vault item (explicit relationship)", () => {
    expect(getAttr(entity.attributes, "parent_key")).toBe("0xparentkey")
  })

  it("includes granted_by address", () => {
    expect(getAttr(entity.attributes, "granted_by")).toBe("0xowner")
  })

  it("includes purpose", () => {
    expect(getAttr(entity.attributes, "purpose")).toBe("Annual checkup")
  })

  it("includes numeric granted_at timestamp", () => {
    const grantedAt = getAttr(entity.attributes, "granted_at")
    expect(typeof grantedAt).toBe("number")
    expect(grantedAt as number).toBeGreaterThan(0)
  })

  it("expires_at is greater than granted_at", () => {
    const grantedAt = getAttr(entity.attributes, "granted_at") as number
    const expiresAt = getAttr(entity.attributes, "expires_at") as number
    expect(expiresAt).toBeGreaterThan(grantedAt)
  })

  it("expires_at is approximately granted_at + durationSeconds * 1000", () => {
    const grantedAt = getAttr(entity.attributes, "granted_at") as number
    const expiresAt = getAttr(entity.attributes, "expires_at") as number
    expect(expiresAt - grantedAt).toBeCloseTo(172800 * 1000, -3)
  })

  it("encodes grant payload into bytes", () => {
    const parsed = decodePayload(entity.payload)
    expect(parsed.grantCID).toBe("QmGrantCid5678abcdef")
    expect(parsed.grantIv).toBe("0xgrantiv")
  })
})

// ─── Grant Record ─────────────────────────────────────────────────────────────

describe("buildGrantRecordEntity", () => {
  const params = {
    granteeName: "Dr. Smith",
    parentVaultItemKey: "0xvaultitem",
    grantEntityKey: "0xgrantentity",
    status: "active" as const,
    category: "medical" as const,
    purpose: "Specialist consultation",
    durationSeconds: 86400,
    ownerAddress: "0xowner",
  }

  const entity = buildGrantRecordEntity(params)

  it("uses 2-year TTL for audit trail (outlives the grant)", () => {
    expect(entity.expiresIn).toBe(TTL.AGENT_GRANT_RECORD)
    expect(entity.expiresIn).toBeGreaterThan(params.durationSeconds)
  })

  it("payload is a Uint8Array", () => {
    expect(ArrayBuffer.isView(entity.payload)).toBe(true)
  })

  it("includes project attribute", () => {
    expect(getAttr(entity.attributes, "project")).toBe(PROJECT_ATTRIBUTE)
  })

  it("includes type as agent_memory", () => {
    expect(getAttr(entity.attributes, "type")).toBe(ENTITY_TYPES.AGENT_MEMORY)
  })

  it("includes subtype as grant_record", () => {
    expect(getAttr(entity.attributes, "subtype")).toBe(ENTITY_SUBTYPES.GRANT_RECORD)
  })

  it("includes grantee_name (human name, not wallet address)", () => {
    expect(getAttr(entity.attributes, "grantee_name")).toBe("Dr. Smith")
  })

  it("includes parent_key linking to vault item", () => {
    expect(getAttr(entity.attributes, "parent_key")).toBe("0xvaultitem")
  })

  it("includes grant_entity linking to access grant", () => {
    expect(getAttr(entity.attributes, "grant_entity")).toBe("0xgrantentity")
  })

  it("includes initial status of active", () => {
    expect(getAttr(entity.attributes, "status")).toBe("active")
  })

  it("includes category for history filtering", () => {
    expect(getAttr(entity.attributes, "category")).toBe("medical")
  })

  it("payload summary mentions grantee name", () => {
    const parsed = decodePayload(entity.payload)
    expect(parsed.summary).toContain("Dr. Smith")
  })

  it("payload outcome starts as null", () => {
    const parsed = decodePayload(entity.payload)
    expect(parsed.outcome).toBeNull()
  })
})

// ─── Conversation Memory ──────────────────────────────────────────────────────

describe("buildConversationMemoryEntity", () => {
  const params = {
    summary: "Shared Medical Report with Dr. Osei for 24 hours for annual checkup.",
    keyFacts: ["Dr. Osei is the user's cardiologist"],
    actions: ["Shared Medical Report with Dr. Osei for 24h"],
    ownerAddress: "0xowner",
  }

  const entity = buildConversationMemoryEntity(params)

  it("uses agent_memory type with conversation_summary subtype", () => {
    expect(getAttr(entity.attributes, "type")).toBe(ENTITY_TYPES.AGENT_MEMORY)
    expect(getAttr(entity.attributes, "subtype")).toBe(ENTITY_SUBTYPES.CONVERSATION_SUMMARY)
  })

  it("stores topic as first 100 chars of summary", () => {
    expect(getAttr(entity.attributes, "topic")).toBe(params.summary.slice(0, 100))
  })

  it("stores action_count", () => {
    expect(getAttr(entity.attributes, "action_count")).toBe(1)
  })

  it("uses 1-year TTL", () => {
    expect(entity.expiresIn).toBe(TTL.AGENT_MEMORY_CONVERSATION)
  })

  it("encodes payload with summary, keyFacts, and actions", () => {
    const parsed = decodePayload(entity.payload)
    expect(parsed.summary).toBe(params.summary)
    expect(parsed.keyFacts).toEqual(params.keyFacts)
    expect(parsed.actions).toEqual(params.actions)
  })
})
