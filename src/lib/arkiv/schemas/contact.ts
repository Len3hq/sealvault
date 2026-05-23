import { jsonToPayload } from "@arkiv-network/sdk"
import type { CreateEntityParameters } from "@arkiv-network/sdk"
import { PROJECT_ATTRIBUTE, ENTITY_TYPES, ENTITY_SUBTYPES, TTL } from "../constants"
import type { BuildContactParams, ContactPayload } from "../types"

// Max tags stored as individual queryable attributes.
// Allows: .where(eq("tag_0", "doctor")) — not possible with comma-joined strings.
const MAX_TAGS = 10

export function buildContactEntity(params: BuildContactParams): CreateEntityParameters {
  const { name, email, tags = [], notes = "", ownerAddress } = params

  const payload: ContactPayload = { notes }
  const trimmedTags = tags.slice(0, MAX_TAGS).map((t) => t.trim()).filter(Boolean)

  return {
    payload: jsonToPayload(payload),
    contentType: "application/json",
    attributes: [
      { key: "project",    value: PROJECT_ATTRIBUTE },
      { key: "type",       value: ENTITY_TYPES.AGENT_MEMORY },
      { key: "subtype",    value: ENTITY_SUBTYPES.CONTACT },
      { key: "owner",      value: ownerAddress },
      { key: "name",       value: name },
      ...(email ? [{ key: "email", value: email }] : []),
      // Individual tag attributes for per-tag querying (tag_0, tag_1, ...)
      ...trimmedTags.map((tag, i) => ({ key: `tag_${i}`, value: tag })),
      { key: "tag_count",  value: trimmedTags.length },
      { key: "added_at",   value: Date.now() },
    ],
    expiresIn: TTL.AGENT_CONTACT,
  }
}
