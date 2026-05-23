import { NextRequest, NextResponse } from "next/server"
import { verifyOwner } from "@/lib/server/verify-auth"
import { getRelayerClient } from "@/lib/arkiv/server-client"
import { saveContact } from "@/lib/arkiv/mutations"
import type { WalletClient } from "@/lib/arkiv/types"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  const ownerAddress = await verifyOwner(req)
  if (!ownerAddress) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { name, email, tags, notes } = await req.json() as {
    name: string
    email?: string
    tags?: string[]
    notes?: string
  }

  if (!name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 })

  const walletClient = getRelayerClient() as unknown as WalletClient
  const { entityKey } = await saveContact(walletClient, ownerAddress, { name, email, tags, notes, ownerAddress })

  return NextResponse.json({ entityKey })
}
