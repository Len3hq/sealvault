import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { verifyOwner } from "@/lib/server/verify-auth"
import { getRelayerClient } from "@/lib/arkiv/server-client"
import { DEFAULT_TX_PARAMS } from "@/lib/arkiv/constants"

export const runtime = "nodejs"

const DeleteBodySchema = z.object({
  entityKey: z.string().min(1),
})

export async function DELETE(req: NextRequest) {
  const ownerAddress = await verifyOwner(req)
  if (!ownerAddress) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = DeleteBodySchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const walletClient = getRelayerClient()
  await walletClient.deleteEntity(
    { entityKey: parsed.data.entityKey as `0x${string}` },
    DEFAULT_TX_PARAMS
  )

  return NextResponse.json({ success: true })
}
