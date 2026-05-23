import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { generateObject } from "ai"
import { openai } from "@ai-sdk/openai"
import { verifyOwner } from "@/lib/server/verify-auth"
import { getRelayerClient } from "@/lib/arkiv/server-client"
import { saveConversationMemory } from "@/lib/arkiv/mutations/agent-memory"
import type { WalletClient } from "@/lib/arkiv/types"

export const runtime = "nodejs"
export const maxDuration = 30

const BodySchema = z.object({
  messages: z.array(z.object({
    role:    z.enum(["user", "assistant", "tool"]),
    content: z.union([z.string(), z.array(z.unknown())]),
  })),
  writeActions: z.array(z.string()),
})

const MemorySummarySchema = z.object({
  worth_saving: z.boolean().describe("true if the conversation contains anything worth remembering — facts about people, context, actions taken, or preferences. false for trivial or purely transactional exchanges with nothing to recall."),
  summary:  z.string().describe("1-2 sentences describing what happened. Empty string if worth_saving is false."),
  keyFacts: z.array(z.string()).describe("Important facts about people, relationships, or context mentioned by the user. Empty if worth_saving is false."),
  actions:  z.array(z.string()).describe("Write actions taken, e.g. 'Shared Medical Report with Dr. Osei for 24h'. Empty if worth_saving is false."),
})

export async function POST(req: NextRequest) {
  const ownerAddress = await verifyOwner(req)
  if (!ownerAddress) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = BodySchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { messages, writeActions } = parsed.data

  // Build a readable transcript for the LLM to summarise
  const transcript = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => {
      const text = typeof m.content === "string" ? m.content : "(tool interaction)"
      return `${m.role.toUpperCase()}: ${text}`
    })
    .join("\n")

  let summary: z.infer<typeof MemorySummarySchema>
  try {
    const result = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: MemorySummarySchema,
      prompt: `You are saving memory for a personal document vault assistant.\n\nDecide whether this conversation is worth remembering. Save it if it contains any of: facts about people (names, roles, relationships), context about the user's situation, actions taken, or preferences expressed. Skip it only if it was a single trivial exchange with absolutely nothing to recall.\n\nWrite actions performed: ${writeActions.join(", ") || "none"}\n\nTranscript:\n${transcript}`,
    })
    summary = result.object
  } catch (err) {
    console.error("[memory] generateObject failed:", err)
    // Fallback: always save if there were write actions; otherwise skip
    if (writeActions.length === 0) return NextResponse.json({ skipped: true })
    summary = {
      worth_saving: true,
      summary:      writeActions.join("; "),
      keyFacts:     [],
      actions:      writeActions,
    }
  }

  if (!summary.worth_saving) {
    return NextResponse.json({ skipped: true })
  }

  try {
    const walletClient = getRelayerClient() as unknown as WalletClient
    const { entityKey } = await saveConversationMemory(walletClient, {
      summary:  summary.summary,
      keyFacts: summary.keyFacts,
      actions:  summary.actions,
      ownerAddress,
    })
    return NextResponse.json({ entityKey, summary: summary.summary })
  } catch (err) {
    console.error("[memory] saveConversationMemory failed:", err)
    return NextResponse.json({ error: "Failed to save memory" }, { status: 500 })
  }
}
