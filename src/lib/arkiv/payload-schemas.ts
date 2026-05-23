import { z } from "zod"

// ─── VaultItemPayload ─────────────────────────────────────────────────────────

export const VaultItemPayloadSchema = z.object({
  cid:            z.string().min(1),
  iv:             z.string().min(1),
  wrappedItemKey: z.string().min(1),
  wrapIv:         z.string().min(1),
  version:        z.number().int().positive(),
})

// ─── AccessGrantPayload ───────────────────────────────────────────────────────

export const AccessGrantPayloadSchema = z.object({
  grantCID:  z.string().min(1),
  grantIv:   z.string().min(1),
  label:     z.string().optional(),
  fileType:  z.string().optional(),
})

// ─── GrantRecordPayload ───────────────────────────────────────────────────────

export const GrantRecordPayloadSchema = z.object({
  summary: z.string(),
  context: z.string(),
  outcome: z.string().nullable(),
})

// ─── ConversationMemoryPayload ────────────────────────────────────────────────

export const ConversationMemoryPayloadSchema = z.object({
  summary:  z.string(),
  keyFacts: z.array(z.string()),
  actions:  z.array(z.string()),
})

// ─── Shared helper ────────────────────────────────────────────────────────────

export function parseEntityPayload<T>(
  schema: z.ZodType<T>,
  payload: Uint8Array | null | undefined
): T {
  if (!payload) throw new Error("Entity payload is missing")
  const raw = JSON.parse(new TextDecoder().decode(payload))
  return schema.parse(raw)
}
