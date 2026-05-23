import { jsonToPayload } from "@arkiv-network/sdk"
import type { CreateEntityParameters } from "@arkiv-network/sdk"
import { PROJECT_ATTRIBUTE, ENTITY_TYPES, ENTITY_SUBTYPES, TTL } from "../constants"
import type { BuildConversationMemoryParams } from "../types"

export function buildConversationMemoryEntity(
  params: BuildConversationMemoryParams
): CreateEntityParameters {
  const { summary, keyFacts, actions, ownerAddress } = params

  return {
    payload: jsonToPayload({ summary, keyFacts, actions }),
    contentType: "application/json",
    attributes: [
      { key: "project",      value: PROJECT_ATTRIBUTE },
      { key: "type",         value: ENTITY_TYPES.AGENT_MEMORY },
      { key: "subtype",      value: ENTITY_SUBTYPES.CONVERSATION_SUMMARY },
      { key: "owner",        value: ownerAddress },
      { key: "topic",        value: summary.slice(0, 100) },
      { key: "action_count", value: actions.length },
      { key: "recorded_at",  value: Date.now() },
    ],
    expiresIn: TTL.AGENT_MEMORY_CONVERSATION,
  }
}
