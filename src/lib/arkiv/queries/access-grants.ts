import { eq, gt } from "@arkiv-network/sdk/query"
import { PROJECT_ATTRIBUTE, ENTITY_TYPES } from "../constants"
import type { PublicClientType } from "../client"

export async function queryActiveGrantsByOwner(
  client: PublicClientType,
  ownerAddress: string
) {
  const now = Date.now()

  return client
    .buildQuery()
    .where([
      eq("project",    PROJECT_ATTRIBUTE),
      eq("type",       ENTITY_TYPES.ACCESS_GRANT),
      eq("owner",      ownerAddress),
      gt("expires_at", now),
    ])
    .withAttributes(true)
    .withMetadata(true)
    .orderBy("expires_at", "number", "asc") // soonest-expiring first
    .limit(200)
    .fetch()
}

export async function queryGrantsByVaultItem(
  client: PublicClientType,
  vaultItemKey: string,
  ownerAddress: string
) {
  return client
    .buildQuery()
    .where([
      eq("project",    PROJECT_ATTRIBUTE),
      eq("type",       ENTITY_TYPES.ACCESS_GRANT),
      eq("owner",      ownerAddress),
      eq("parent_key", vaultItemKey),
    ])
    .withAttributes(true)
    .withMetadata(true)
    .limit(200)
    .fetch()
}

export async function queryGrantByTokenHash(
  client: PublicClientType,
  tokenHash: string
) {
  const result = await client
    .buildQuery()
    .where([
      eq("project",    PROJECT_ATTRIBUTE),
      eq("type",       ENTITY_TYPES.ACCESS_GRANT),
      eq("token_hash", tokenHash),
    ])
    .withPayload(true) // need ciphertext to decrypt for grantee
    .withAttributes(true)
    .limit(1)
    .fetch()

  return result.entities[0] ?? null
}
