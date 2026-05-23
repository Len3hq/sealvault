import { describe, it, expect, vi, beforeEach } from "vitest"
import { buildReadTools, writeToolSchemas } from "@/lib/agent/tools"
import type { queryVaultItems as QueryFn } from "@/lib/arkiv/queries"

type QueryResult = Awaited<ReturnType<typeof QueryFn>>

// ─── Mock Arkiv queries ────────────────────────────────────────────────────────

vi.mock("@/lib/arkiv/queries", () => ({
  queryVaultItems: vi.fn(),
  queryActiveGrantsByOwner: vi.fn(),
  queryContacts: vi.fn(),
  queryGrantHistory: vi.fn(),
}))

vi.mock("@/lib/arkiv/client", () => ({
  publicClient: {},
}))

import {
  queryVaultItems,
  queryActiveGrantsByOwner,
  queryContacts,
  queryGrantHistory,
} from "@/lib/arkiv/queries"

const mockQuery = vi.mocked

const OWNER = "0xdeadbeefdeadbeef"

// ─── Write tool schema tests ───────────────────────────────────────────────────

describe("writeToolSchemas — grant_access", () => {
  const tool = writeToolSchemas.grant_access

  it("has a description", () => {
    expect(tool.description).toBeTruthy()
  })

  it("has an inputSchema", () => {
    expect(tool.inputSchema).toBeDefined()
  })

  it("does not have execute (client-side only)", () => {
    expect((tool as unknown as { execute?: unknown }).execute).toBeUndefined()
  })
})

describe("writeToolSchemas — revoke_access", () => {
  const tool = writeToolSchemas.revoke_access

  it("has description and inputSchema", () => {
    expect(tool.description).toBeTruthy()
    expect(tool.inputSchema).toBeDefined()
  })

  it("does not have execute", () => {
    expect((tool as unknown as { execute?: unknown }).execute).toBeUndefined()
  })
})

describe("writeToolSchemas — extend_access", () => {
  const tool = writeToolSchemas.extend_access

  it("has description and inputSchema", () => {
    expect(tool.description).toBeTruthy()
    expect(tool.inputSchema).toBeDefined()
  })

  it("does not have execute", () => {
    expect((tool as unknown as { execute?: unknown }).execute).toBeUndefined()
  })
})

describe("writeToolSchemas — save_contact", () => {
  const tool = writeToolSchemas.save_contact

  it("has description and inputSchema", () => {
    expect(tool.description).toBeTruthy()
    expect(tool.inputSchema).toBeDefined()
  })

  it("does not have execute", () => {
    expect((tool as unknown as { execute?: unknown }).execute).toBeUndefined()
  })
})

describe("writeToolSchemas — delete_vault_item", () => {
  const tool = writeToolSchemas.delete_vault_item

  it("has description and inputSchema", () => {
    expect(tool.description).toBeTruthy()
    expect(tool.inputSchema).toBeDefined()
  })

  it("does not have execute", () => {
    expect((tool as unknown as { execute?: unknown }).execute).toBeUndefined()
  })
})

// ─── Read tool tests ───────────────────────────────────────────────────────────

function makeEntity(attrs: Array<{ key: string; value: string | number }>) {
  return {
    key: "0xabcd",
    attributes: attrs,
    payload: null,
    contentType: "application/json",
    metadata: {},
  }
}

describe("buildReadTools — list_vault_items", () => {
  beforeEach(() => {
    mockQuery(queryVaultItems).mockResolvedValue({ entities: [] } as unknown as QueryResult)
  })

  it("returns an empty array when vault is empty", async () => {
    const tools = buildReadTools(OWNER)
    const tool = tools.list_vault_items as unknown as {
      execute: (args: { category?: string; limit?: number }) => Promise<unknown[]>
    }
    const result = await tool.execute({})
    expect(result).toEqual([])
  })

  it("maps entity attributes to a clean shape", async () => {
    mockQuery(queryVaultItems).mockResolvedValue({
      entities: [
        makeEntity([
          { key: "label", value: "Lab Results" },
          { key: "category", value: "medical" },
          { key: "file_type", value: "application/pdf" },
          { key: "size_bytes", value: 12345 },
          { key: "created_at", value: 1716000000000 },
        ]),
      ],
    } as unknown as QueryResult)

    const tools = buildReadTools(OWNER)
    const tool = tools.list_vault_items as unknown as {
      execute: (args: { category?: string; limit?: number }) => Promise<unknown[]>
    }
    const [item] = await tool.execute({ category: "medical" })

    expect(item).toMatchObject({
      key: "0xabcd",
      label: "Lab Results",
      category: "medical",
      fileType: "application/pdf",
    })
  })

  it("has an execute function (server-side)", () => {
    const tools = buildReadTools(OWNER)
    expect(typeof (tools.list_vault_items as unknown as { execute?: unknown }).execute).toBe(
      "function"
    )
  })
})

describe("buildReadTools — list_active_grants", () => {
  it("returns an empty array when no grants are active", async () => {
    mockQuery(queryActiveGrantsByOwner).mockResolvedValue({ entities: [] } as unknown as QueryResult)
    const tools = buildReadTools(OWNER)
    const tool = tools.list_active_grants as unknown as {
      execute: (args: Record<string, never>) => Promise<unknown[]>
    }
    const result = await tool.execute({})
    expect(result).toEqual([])
  })

  it("maps grant attributes to a clean shape", async () => {
    mockQuery(queryActiveGrantsByOwner).mockResolvedValue({
      entities: [
        makeEntity([
          { key: "parent_key", value: "0xparent" },
          { key: "purpose", value: "Annual check-up review" },
          { key: "granted_by", value: OWNER },
          { key: "expires_at", value: 1716100000000 },
        ]),
      ],
    } as unknown as QueryResult)

    const tools = buildReadTools(OWNER)
    const tool = tools.list_active_grants as unknown as {
      execute: (args: Record<string, never>) => Promise<unknown[]>
    }
    const [grant] = await tool.execute({})

    expect(grant).toMatchObject({
      grantEntityKey: "0xabcd",
      parentVaultItemKey: "0xparent",
      purpose: "Annual check-up review",
    })
  })
})

describe("buildReadTools — lookup_contact", () => {
  it("returns contact details with parsed payload", async () => {
    const payload = JSON.stringify({ notes: "Primary care physician" })
    const encoder = new TextEncoder()
    // queryContacts now returns Entity[] directly (not QueryResult)
    mockQuery(queryContacts).mockResolvedValue([
      {
        ...makeEntity([
          { key: "name",      value: "Dr. Smith" },
          { key: "email",     value: "smith@clinic.com" },
          { key: "tag_0",     value: "doctor" },
          { key: "tag_1",     value: "primary" },
          { key: "tag_count", value: 2 },
        ]),
        payload: encoder.encode(payload),
      },
    ] as never)

    const tools = buildReadTools(OWNER)
    const tool = tools.lookup_contact as unknown as {
      execute: (args: { name: string }) => Promise<unknown[]>
    }
    const [contact] = await tool.execute({ name: "Dr. Smith" })

    expect(contact).toMatchObject({
      name: "Dr. Smith",
      email: "smith@clinic.com",
      tags: ["doctor", "primary"],
      notes: "Primary care physician",
    })
  })
})

describe("buildReadTools — query_grant_history", () => {
  it("returns history records with outcome field", async () => {
    const payload = JSON.stringify({
      summary: "Shared lab results with Dr. Smith",
      context: "Medical record sharing",
      outcome: "expired",
    })
    const encoder = new TextEncoder()
    mockQuery(queryGrantHistory).mockResolvedValue({
      entities: [
        {
          ...makeEntity([
            { key: "grantee_name", value: "Dr. Smith" },
            { key: "category", value: "medical" },
            { key: "status", value: "expired" },
          ]),
          payload: encoder.encode(payload),
        },
      ],
    } as unknown as QueryResult)

    const tools = buildReadTools(OWNER)
    const tool = tools.query_grant_history as unknown as {
      execute: (args: { limit?: number }) => Promise<unknown[]>
    }
    const [record] = await tool.execute({ limit: 10 })

    expect(record).toMatchObject({
      granteeName: "Dr. Smith",
      category: "medical",
      status: "expired",
      outcome: "expired",
      summary: "Shared lab results with Dr. Smith",
    })
  })
})

// ─── Tool counts ───────────────────────────────────────────────────────────────

describe("tool inventory", () => {
  it("exports exactly 4 read tools", () => {
    const tools = buildReadTools(OWNER)
    expect(Object.keys(tools)).toHaveLength(4)
  })

  it("exports exactly 5 write tool schemas", () => {
    expect(Object.keys(writeToolSchemas)).toHaveLength(5)
  })

  it("all write tools have no execute function", () => {
    for (const [name, tool] of Object.entries(writeToolSchemas)) {
      expect(
        (tool as unknown as { execute?: unknown }).execute,
        `${name} should have no execute`
      ).toBeUndefined()
    }
  })

  it("all read tools have an execute function", () => {
    const tools = buildReadTools(OWNER)
    for (const [name, tool] of Object.entries(tools)) {
      expect(
        typeof (tool as unknown as { execute?: unknown }).execute,
        `${name} should have execute`
      ).toBe("function")
    }
  })
})
