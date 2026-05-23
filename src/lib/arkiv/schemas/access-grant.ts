import { jsonToPayload } from "@arkiv-network/sdk"
import type { CreateEntityParameters } from "@arkiv-network/sdk"
import { PROJECT_ATTRIBUTE, ENTITY_TYPES, TTL } from "../constants"
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
    label,
    granteeName,
  } = params

  // Clamp to [GRANT_MIN, GRANT_MAX] — prevents zero-TTL or runaway grants
  const clampedDuration = Math.min(
    Math.max(durationSeconds, TTL.GRANT_MIN),
    TTL.GRANT_MAX
  )

  const now = Date.now()

  return {
    payload: jsonToPayload(accessGrantPayload),
    contentType: "application/json",
    attributes: [
      { key: "project",     value: PROJECT_ATTRIBUTE },
      { key: "type",        value: ENTITY_TYPES.ACCESS_GRANT },
      { key: "owner",       value: grantedByAddress },
      { key: "token_hash",  value: tokenHash },
      { key: "parent_key",  value: parentVaultItemKey },
      { key: "granted_by",  value: grantedByAddress },
      { key: "label",        value: label },
      { key: "grantee_name", value: granteeName },
      { key: "purpose",      value: purpose },
      { key: "granted_at",   value: now },
      { key: "expires_at",   value: now + clampedDuration * 1000 },
    ],
    expiresIn: clampedDuration, // TTL = the revocation mechanism
  }
}
