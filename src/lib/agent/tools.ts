import { tool, zodSchema } from "ai"
import { z } from "zod"
import { publicClient } from "@/lib/arkiv/client"
import {
  queryVaultItems,
  queryActiveGrantsByOwner,
  queryContacts,
  queryGrantHistory,
} from "@/lib/arkiv/queries"
import { getAttributeValue } from "@/lib/arkiv/schemas"
import { VAULT_CATEGORIES } from "@/lib/arkiv/constants"
import type { VaultCategory } from "@/lib/arkiv/constants"
import {
  GrantRecordPayloadSchema,
  ContactPayloadSchema,
} from "@/lib/arkiv/payload-schemas"
import type { z as zod } from "zod"

// ─── Helpers ──────────────────────────────────────────────────────────────────

type AttrList = Array<{ key: string; value: string | number }>

function toAttrs(entity: { attributes?: unknown }): AttrList {
  return (entity.attributes as AttrList) ?? []
}

function safeParsePayload<T>(
  schema: zod.ZodType<T>,
  entity: { payload?: Uint8Array | null }
): T | null {
  if (!entity.payload) return null
  try {
    const raw = JSON.parse(new TextDecoder().decode(entity.payload))
    return schema.parse(raw)
  } catch {
    return null
  }
}

// Read tag_0, tag_1, ... up to tag_count from individual tag attributes
function readTags(attrs: AttrList): string[] {
  const count = Number(attrs.find((a) => a.key === "tag_count")?.value ?? 0)
  const tags: string[] = []
  for (let i = 0; i < count; i++) {
    const val = attrs.find((a) => a.key === `tag_${i}`)?.value
    if (typeof val === "string") tags.push(val)
  }
  return tags
}

const categoryEnum = z.enum([...VAULT_CATEGORIES] as unknown as [string, ...string[]])

// ─── Read tools (server-side — no master key needed) ─────────────────────────

export function buildReadTools(ownerAddress: string) {
  return {
    list_vault_items: tool({
      description:
        "List documents stored in the vault. Returns entity keys, labels, categories, and creation times. Call this before any write tool that needs a vaultItemKey.",
      inputSchema: zodSchema(
        z.object({
          category: categoryEnum
            .optional()
            .describe("Filter by category: medical, legal, financial, or personal"),
          limit: z
            .number()
            .int()
            .min(1)
            .max(100)
            .default(20)
            .optional()
            .describe("Max results (default 20)"),
        })
      ),
      execute: async ({ category, limit = 20 }) => {
        const result = await queryVaultItems(publicClient, ownerAddress, { category: category as VaultCategory | undefined, limit })
        return result.entities.map((e) => {
          const a = toAttrs(e)
          return {
            key: String(e.key),
            label: getAttributeValue(a, "label") ?? "Untitled",
            category: getAttributeValue(a, "category"),
            fileType: getAttributeValue(a, "file_type"),
            sizeBytes: getAttributeValue(a, "size_bytes"),
            createdAt: getAttributeValue(a, "created_at"),
          }
        })
      },
    }),

    list_active_grants: tool({
      description:
        "List all active magic-link grants. Returns grant entity keys, which document each grant points to, the grantee name, purpose, and expiry time. Call this before revoking or extending a grant.",
      inputSchema: zodSchema(z.object({})),
      execute: async () => {
        const result = await queryActiveGrantsByOwner(publicClient, ownerAddress)
        return result.entities.map((e) => {
          const a = toAttrs(e)
          return {
            grantEntityKey: String(e.key),
            parentVaultItemKey: getAttributeValue(a, "parent_key"),
            purpose: getAttributeValue(a, "purpose"),
            grantedBy: getAttributeValue(a, "granted_by"),
            expiresAt: getAttributeValue(a, "expires_at"),
          }
        })
      },
    }),

    lookup_contact: tool({
      description: "Look up a saved contact by name. Returns their email, tags, and notes.",
      inputSchema: zodSchema(
        z.object({
          name: z.string().describe("Name or partial name to search for"),
        })
      ),
      execute: async ({ name }) => {
        const entities = await queryContacts(publicClient, ownerAddress, name)
        return entities.map((e) => {
          const a = toAttrs(e)
          const p = safeParsePayload(ContactPayloadSchema, e)
          return {
            key: String(e.key),
            name: getAttributeValue(a, "name"),
            email: getAttributeValue(a, "email"),
            tags: readTags(a),
            notes: p?.notes ?? "",
            addedAt: getAttributeValue(a, "added_at"),
          }
        })
      },
    }),

    query_grant_history: tool({
      description:
        "Query historical grant records to see who accessed documents, when, and what the outcome was. Grant records survive even after the grant link has expired.",
      inputSchema: zodSchema(
        z.object({
          category: categoryEnum.optional().describe("Filter by document category"),
          granteeName: z.string().optional().describe("Filter by grantee name"),
          since: z
            .number()
            .optional()
            .describe("Only records after this Unix timestamp in milliseconds"),
          limit: z
            .number()
            .int()
            .min(1)
            .max(50)
            .default(20)
            .optional()
            .describe("Max results (default 20)"),
        })
      ),
      execute: async ({ category, granteeName, since, limit = 20 }) => {
        const result = await queryGrantHistory(publicClient, ownerAddress, {
          category: category as VaultCategory | undefined,
          granteeName,
          since,
          limit,
        })
        return result.entities.map((e) => {
          const a = toAttrs(e)
          const p = safeParsePayload(GrantRecordPayloadSchema, e)
          return {
            key: String(e.key),
            granteeName: getAttributeValue(a, "grantee_name"),
            category: getAttributeValue(a, "category"),
            purpose: getAttributeValue(a, "purpose"),
            status: getAttributeValue(a, "status"),
            grantedAt: getAttributeValue(a, "granted_at"),
            expiresAt: getAttributeValue(a, "expires_at"),
            summary: p?.summary ?? "",
            outcome: p?.outcome ?? null,
          }
        })
      },
    }),
  }
}

// ─── Write tool schemas (client-side — need master key / wallet client) ───────
// No execute function. The client intercepts these via onToolCall.

export const writeToolSchemas = {
  grant_access: tool({
    description:
      "Share a vault document with a person via a magic link. The link is the decryption key — no account needed by the recipient. Returns the magic link URL.",
    inputSchema: zodSchema(
      z.object({
        vaultItemKey: z.string().describe("Entity key of the vault item to share"),
        granteeName: z.string().describe("Name of the person receiving access"),
        purpose: z.string().describe("Reason for sharing (shown to the grantee)"),
        durationSeconds: z
          .number()
          .int()
          .min(3600)
          .describe("How long the link should work, in seconds (min 3600 = 1 hour)"),
      })
    ),
  }),

  revoke_access: tool({
    description:
      "Immediately revoke a magic link. The link stops working within seconds of revocation.",
    inputSchema: zodSchema(
      z.object({
        grantEntityKey: z.string().describe("Entity key of the grant to revoke"),
        granteeName: z
          .string()
          .optional()
          .describe("Grantee name for the confirmation message"),
      })
    ),
  }),

  extend_access: tool({
    description: "Push the expiry of a magic link further into the future.",
    inputSchema: zodSchema(
      z.object({
        grantEntityKey: z.string().describe("Entity key of the grant to extend"),
        additionalSeconds: z
          .number()
          .int()
          .min(3600)
          .describe("Seconds to add on top of the current expiry"),
      })
    ),
  }),

  save_contact: tool({
    description: "Save a person's contact details for easy future access grants.",
    inputSchema: zodSchema(
      z.object({
        name: z.string().describe("Contact's full name"),
        email: z.string().email().optional().describe("Contact's email address"),
        tags: z
          .array(z.string())
          .optional()
          .describe("Tags for organizing (e.g. ['doctor', 'specialist'])"),
        notes: z.string().optional().describe("Any notes about this contact"),
      })
    ),
  }),

  delete_vault_item: tool({
    description:
      "Permanently delete a vault document and all its active access grants. This cannot be undone. All magic links for this document will stop working immediately.",
    inputSchema: zodSchema(
      z.object({
        vaultItemKey: z.string().describe("Entity key of the vault item to delete"),
        label: z.string().optional().describe("Document label for confirmation display"),
      })
    ),
  }),
}
