import { eq, gt } from "@arkiv-network/sdk/query"
import { PROJECT_ATTRIBUTE, ENTITY_TYPES, ENTITY_SUBTYPES, RELAYER_ADDRESS } from "../constants"
import type { PublicClientType } from "../client"
import type { VaultCategory } from "../constants"
import type { Entity } from "@arkiv-network/sdk"

export async function queryContacts(
  client: PublicClientType,
  ownerAddress: string,
  search?: string
): Promise<Entity[]> {
  // Fetch all contacts — glob/partial matching isn't in the fluent builder,
  // so we filter client-side for case-insensitive substring search.
  const result = await client
    .buildQuery()
    .where([
      eq("project", PROJECT_ATTRIBUTE),
      eq("type",    ENTITY_TYPES.AGENT_MEMORY),
      eq("subtype", ENTITY_SUBTYPES.CONTACT),
      eq("owner",   ownerAddress),
    ])
    .createdBy(RELAYER_ADDRESS)
    .withPayload(true)
    .withAttributes(true)
    .orderBy("added_at", "number", "desc")
    .limit(200)
    .fetch()

  if (!search) return result.entities

  const q = search.toLowerCase()
  return result.entities.filter((e) => {
    const nameAttr = (e.attributes as Array<{ key: string; value: string | number }>)
      .find((a) => a.key === "name")
    return typeof nameAttr?.value === "string" && nameAttr.value.toLowerCase().includes(q)
  })
}

export async function queryGrantHistory(
  client: PublicClientType,
  ownerAddress: string,
  options: {
    category?: VaultCategory
    granteeName?: string
    since?: number
    limit?: number
  } = {}
) {
  const { category, granteeName, since, limit = 50 } = options

  const predicates = [
    eq("project", PROJECT_ATTRIBUTE),
    eq("type",    ENTITY_TYPES.AGENT_MEMORY),
    eq("subtype", ENTITY_SUBTYPES.GRANT_RECORD),
    ...(category     ? [eq("category",     category)]     : []),
    ...(granteeName  ? [eq("grantee_name", granteeName)]  : []),
    ...(since        ? [gt("granted_at",   since)]        : []),
  ]

  return client
    .buildQuery()
    .where([...predicates, eq("owner", ownerAddress)])
    .createdBy(RELAYER_ADDRESS)
    .withPayload(true)
    .withAttributes(true)
    .orderBy("granted_at", "number", "desc")
    .limit(limit)
    .fetch()
}

export async function queryGrantRecordByGrantEntity(
  client: PublicClientType,
  grantEntityKey: string,
  ownerAddress: string
): Promise<Entity | null> {
  const result = await client
    .buildQuery()
    .where([
      eq("project",      PROJECT_ATTRIBUTE),
      eq("type",         ENTITY_TYPES.AGENT_MEMORY),
      eq("subtype",      ENTITY_SUBTYPES.GRANT_RECORD),
      eq("owner",        ownerAddress),
      eq("grant_entity", grantEntityKey),
    ])
    .createdBy(RELAYER_ADDRESS)
    .withPayload(true)
    .withAttributes(true)
    .limit(1)
    .fetch()

  return result.entities[0] ?? null
}
