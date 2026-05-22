import { jsonToPayload } from "@arkiv-network/sdk"
import type { Entity } from "@arkiv-network/sdk"
import { buildAccessGrantEntity, buildGrantRecordEntity } from "../schemas"
import type { GrantStatus } from "../constants"
import type { WalletClient, BuildAccessGrantParams, BuildGrantRecordParams } from "../types"

export async function createAccessGrant(
  walletClient: WalletClient,
  params: BuildAccessGrantParams
): Promise<{ entityKey: string }> {
  const entity = buildAccessGrantEntity(params)
  const result = await walletClient.createEntity(entity)
  return { entityKey: result.entityKey }
}

export async function revokeAccessGrant(
  walletClient: WalletClient,
  grantEntityKey: string
): Promise<void> {
  await walletClient.deleteEntity({ entityKey: grantEntityKey as `0x${string}` })
}

export async function extendAccessGrant(
  walletClient: WalletClient,
  grantEntityKey: string,
  additionalSeconds: number
): Promise<void> {
  await walletClient.extendEntity({
    entityKey: grantEntityKey as `0x${string}`,
    expiresIn: additionalSeconds,
  })
}

export async function createGrantRecord(
  walletClient: WalletClient,
  params: BuildGrantRecordParams
): Promise<{ entityKey: string }> {
  const entity = buildGrantRecordEntity(params)
  const result = await walletClient.createEntity(entity)
  return { entityKey: result.entityKey }
}

export async function updateGrantRecordStatus(
  walletClient: WalletClient,
  entity: Entity,
  status: GrantStatus,
  outcome?: string
): Promise<void> {
  if (!entity.payload) return

  const currentPayload = JSON.parse(new TextDecoder().decode(entity.payload))
  const newPayload = { ...currentPayload, ...(outcome !== undefined ? { outcome } : {}) }

  // Calculate remaining TTL from the expires_at attribute
  const expiresAtAttr = entity.attributes.find((a) => a.key === "expires_at")?.value as number | undefined
  const remainingSeconds = expiresAtAttr
    ? Math.max(60, Math.ceil((expiresAtAttr - Date.now()) / 1000))
    : 3600 // fallback: 1 hour

  const updatedAttributes = entity.attributes.map((a) =>
    a.key === "status" ? { key: "status", value: status } : a
  )

  await walletClient.updateEntity({
    entityKey: entity.key,
    payload: jsonToPayload(newPayload),
    contentType: entity.contentType ?? "application/json",
    attributes: updatedAttributes,
    expiresIn: remainingSeconds,
  })
}

export async function batchCreateAccessGrants(
  walletClient: WalletClient,
  grants: BuildAccessGrantParams[]
): Promise<string[]> {
  const creates = grants.map(buildAccessGrantEntity)
  const result = await walletClient.mutateEntities({ creates })
  return result.createdEntities.map(String)
}
