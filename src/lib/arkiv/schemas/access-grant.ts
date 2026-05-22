import { jsonToPayload } from "@arkiv-network/sdk"
import type { CreateEntityParameters } from "@arkiv-network/sdk"
import { PROJECT_ATTRIBUTE, ENTITY_TYPES } from "../constants"
import type { BuildAccessGrantParams } from "../types"

export function buildAccessGrantEntity(
  params: BuildAccessGrantParams
): CreateEntityParameters {
  const {
    accessGrantPayload,
    tokenHash,
    parentVaultItemKey,
    grantedByAddress,
    purpose,
    durationSeconds,
  } = params

  const now = Date.now()

  return {
    payload: jsonToPayload(accessGrantPayload),
    contentType: "application/json",
    attributes: [
      { key: "project",     value: PROJECT_ATTRIBUTE },
      { key: "type",        value: ENTITY_TYPES.ACCESS_GRANT },
      { key: "token_hash",  value: tokenHash },
      { key: "parent_key",  value: parentVaultItemKey }, // explicit relationship
      { key: "granted_by",  value: grantedByAddress },
      { key: "purpose",     value: purpose },
      { key: "granted_at",  value: now },
      { key: "expires_at",  value: now + durationSeconds * 1000 },
    ],
    expiresIn: durationSeconds, // TTL = the revocation mechanism
  }
}
