import { streamText, convertToModelMessages, stepCountIs } from "ai"
import { openai } from "@ai-sdk/openai"
import { buildReadTools, writeToolSchemas } from "@/lib/agent/tools"
import { buildSystemPrompt } from "@/lib/agent/system-prompt"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(req: Request) {
  const { messages, ownerAddress } = await req.json()

  if (!ownerAddress) {
    return new Response("ownerAddress required", { status: 400 })
  }

  const readTools = buildReadTools(ownerAddress as string)

  const result = streamText({
    model: openai("gpt-4o-mini"),
    system: buildSystemPrompt(),
    messages: await convertToModelMessages(messages),
    tools: {
      ...readTools,
      ...writeToolSchemas,
    },
    stopWhen: stepCountIs(10),
  })

  return result.toUIMessageStreamResponse()
}
