import { jsonToPayload } from "@arkiv-network/sdk"
import type { CreateEntityParameters } from "@arkiv-network/sdk"
import { PROJECT_ATTRIBUTE, ENTITY_TYPES, TTL } from "../constants"
import type { BuildVaultItemParams } from "../types"

export function buildVaultItemEntity(params: BuildVaultItemParams): CreateEntityParameters {
  const { encryptedPayload, label, category, fileType, sizeBytes } = params

  return {
    payload: jsonToPayload(encryptedPayload),
    contentType: "application/json",
    attributes: [
      { key: "project",    value: PROJECT_ATTRIBUTE },
      { key: "type",       value: ENTITY_TYPES.VAULT_ITEM },
      { key: "category",   value: category },
      { key: "label",      value: label },
      { key: "file_type",  value: fileType },
      { key: "created_at", value: Date.now() },
      { key: "size_bytes", value: sizeBytes },
    ],
    expiresIn: TTL.VAULT_ITEM,
  }
}

export function getAttributeValue(
  attributes: Array<{ key: string; value: string | number }>,
  key: string
): string | number | undefined {
  return attributes.find((a) => a.key === key)?.value
}
