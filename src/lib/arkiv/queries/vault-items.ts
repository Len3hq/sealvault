import { eq } from "@arkiv-network/sdk/query"
import { PROJECT_ATTRIBUTE, ENTITY_TYPES } from "../constants"
import type { PublicClientType } from "../client"
import type { VaultCategory } from "../constants"

export interface QueryVaultItemsOptions {
  category?: VaultCategory
  limit?: number
}

export async function queryVaultItems(
  client: PublicClientType,
  ownerAddress: string,
  options: QueryVaultItemsOptions = {}
) {
  const { category, limit = 50 } = options

  const predicates = [
    eq("project", PROJECT_ATTRIBUTE),
    eq("type", ENTITY_TYPES.VAULT_ITEM),
    ...(category ? [eq("category", category)] : []),
  ]

  return client
    .buildQuery()
    .where(predicates)
    .createdBy(ownerAddress as `0x${string}`)
    .withPayload(false) // payload is encrypted — only fetch on demand
    .withAttributes(true)
    .withMetadata(true)
    .orderBy("created_at", "number", "desc")
    .limit(limit)
    .fetch()
}

export async function queryVaultItemByKey(
  client: PublicClientType,
  entityKey: string,
  ownerAddress: string
) {
  const result = await client
    .buildQuery()
    .where([
      eq("project", PROJECT_ATTRIBUTE),
      eq("type", ENTITY_TYPES.VAULT_ITEM),
    ])
    .createdBy(ownerAddress as `0x${string}`)
    .withPayload(true) // fetch encrypted payload for decryption
    .withAttributes(true)
    .withMetadata(true)
    .fetch()

  return result.entities.find((e) => e.key === (entityKey as `0x${string}`)) ?? null
}
