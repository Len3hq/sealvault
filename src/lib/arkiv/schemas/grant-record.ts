import { jsonToPayload } from "@arkiv-network/sdk"
import type { CreateEntityParameters } from "@arkiv-network/sdk"
import { PROJECT_ATTRIBUTE, ENTITY_TYPES, ENTITY_SUBTYPES, TTL } from "../constants"
import type { BuildGrantRecordParams, GrantRecordPayload } from "../types"

export function buildGrantRecordEntity(
  params: BuildGrantRecordParams
): CreateEntityParameters {
  const {
    granteeName,
    parentVaultItemKey,
    grantEntityKey,
    status,
    category,
    purpose,
    durationSeconds,
  } = params

  const now = Date.now()

  const payload: GrantRecordPayload = {
    summary: `Granted ${granteeName} access for ${formatDuration(durationSeconds)} — ${purpose}`,
    context: purpose,
    outcome: null,
  }

  return {
    payload: jsonToPayload(payload),
    contentType: "application/json",
    attributes: [
      { key: "project",      value: PROJECT_ATTRIBUTE },
      { key: "type",         value: ENTITY_TYPES.AGENT_MEMORY },
      { key: "subtype",      value: ENTITY_SUBTYPES.GRANT_RECORD },
      { key: "grantee_name", value: granteeName },
      { key: "parent_key",   value: parentVaultItemKey }, // links to vault item
      { key: "grant_entity", value: grantEntityKey },     // links to access grant
      { key: "status",       value: status },
      { key: "category",     value: category },
      { key: "granted_at",   value: now },
      { key: "expires_at",   value: now + durationSeconds * 1000 },
    ],
    expiresIn: TTL.AGENT_GRANT_RECORD, // outlives the grant for audit trail
  }
}

function formatDuration(seconds: number): string {
  if (seconds < 3600) return `${Math.round(seconds / 60)} minutes`
  if (seconds < 86400) return `${Math.round(seconds / 3600)} hours`
  return `${Math.round(seconds / 86400)} days`
}
