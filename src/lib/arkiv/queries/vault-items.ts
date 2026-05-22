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

// Direct single-entity lookup — getEntity fetches payload + attributes in one RPC call.
export async function queryVaultItemByKey(
  client: PublicClientType,
  entityKey: string,
  _ownerAddress: string
) {
  try {
    return await client.getEntity(entityKey as `0x${string}`)
  } catch {
    return null
  }
}
