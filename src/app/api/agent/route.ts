import { streamText, convertToModelMessages, stepCountIs } from "ai"
import { openai } from "@ai-sdk/openai"
import { buildReadTools, writeToolSchemas } from "@/lib/agent/tools"
import { buildSystemPrompt } from "@/lib/agent/system-prompt"
import { publicClient } from "@/lib/arkiv/client"
import { queryConversationMemories } from "@/lib/arkiv/queries/agent-memory"
import { ConversationMemoryPayloadSchema } from "@/lib/arkiv/payload-schemas"

export const runtime = "nodejs"
export const maxDuration = 60

function formatMemories(entities: Array<{ attributes?: unknown; payload?: Uint8Array | null }>): string {
  return entities.map((e) => {
    const attrs = (e.attributes as Array<{ key: string; value: string | number }>) ?? []
    const date = new Date(Number(attrs.find((a) => a.key === "recorded_at")?.value ?? 0))
      .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    const topic = attrs.find((a) => a.key === "topic")?.value ?? ""

    let detail = ""
    if (e.payload) {
      try {
        const raw = JSON.parse(new TextDecoder().decode(e.payload))
        const parsed = ConversationMemoryPayloadSchema.safeParse(raw)
        if (parsed.success) {
          const facts = parsed.data.keyFacts.length ? ` Facts: ${parsed.data.keyFacts.join("; ")}.` : ""
          detail = facts
        }
      } catch { /* non-fatal */ }
    }

    return `[${date}] ${topic}${detail}`
  }).join("\n")
}

export async function POST(req: Request) {
  const { messages, ownerAddress } = await req.json()

  if (!ownerAddress) {
    return new Response("ownerAddress required", { status: 400 })
  }

  // Load owner's on-chain memories — non-fatal if it fails
  let memories: string | undefined
  try {
    const result = await queryConversationMemories(publicClient, ownerAddress as string, 8)
    if (result.entities.length > 0) {
      memories = formatMemories(result.entities)
    }
  } catch { /* agent works fine without memories */ }

  const readTools = buildReadTools(ownerAddress as string)

  const result = streamText({
    model: openai("gpt-4o-mini"),
    system: buildSystemPrompt(memories),
    messages: await convertToModelMessages(messages),
    tools: {
      ...readTools,
      ...writeToolSchemas,
    },
    stopWhen: stepCountIs(10),
  })

  return result.toUIMessageStreamResponse()
}
