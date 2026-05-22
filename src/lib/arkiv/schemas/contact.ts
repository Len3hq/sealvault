import { jsonToPayload } from "@arkiv-network/sdk"
import type { CreateEntityParameters } from "@arkiv-network/sdk"
import { PROJECT_ATTRIBUTE, ENTITY_TYPES, ENTITY_SUBTYPES, TTL } from "../constants"
import type { BuildContactParams, ContactPayload } from "../types"

export function buildContactEntity(params: BuildContactParams): CreateEntityParameters {
  const { name, email, tags = [], notes = "" } = params

  const payload: ContactPayload = { notes }

  return {
    payload: jsonToPayload(payload),
    contentType: "application/json",
    attributes: [
      { key: "project",   value: PROJECT_ATTRIBUTE },
      { key: "type",      value: ENTITY_TYPES.AGENT_MEMORY },
      { key: "subtype",   value: ENTITY_SUBTYPES.CONTACT },
      { key: "name",      value: name },
      ...(email ? [{ key: "email", value: email }] : []),
      { key: "tags",      value: tags.join(",") },
      { key: "added_at",  value: Date.now() },
    ],
    expiresIn: TTL.AGENT_CONTACT,
  }
}
