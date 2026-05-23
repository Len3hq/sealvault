import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { verifyOwner } from "@/lib/server/verify-auth"
import { getRelayerClient } from "@/lib/arkiv/server-client"
import { saveContact } from "@/lib/arkiv/mutations"
import type { WalletClient } from "@/lib/arkiv/types"

export const runtime = "nodejs"

const PostBodySchema = z.object({
  name:  z.string().min(1),
  email: z.string().email().optional(),
  tags:  z.array(z.string()).optional(),
  notes: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const ownerAddress = await verifyOwner(req)
  if (!ownerAddress) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = PostBodySchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const { name, email, tags, notes } = parsed.data

  const walletClient = getRelayerClient() as unknown as WalletClient
  const { entityKey } = await saveContact(walletClient, ownerAddress, { name, email, tags, notes, ownerAddress })

  return NextResponse.json({ entityKey })
}
