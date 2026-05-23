import { NextRequest, NextResponse } from "next/server"
import { verifyOwner } from "@/lib/server/verify-auth"
import { getRelayerClient } from "@/lib/arkiv/server-client"
import { publicClient } from "@/lib/arkiv/client"
import { createVaultItem } from "@/lib/arkiv/mutations"
import { deleteVaultItemWithGrants } from "@/lib/arkiv/mutations"
import type { VaultItemPayload } from "@/lib/arkiv/types"
import type { VaultCategory } from "@/lib/arkiv/constants"
import type { WalletClient } from "@/lib/arkiv/types"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  const ownerAddress = await verifyOwner(req)
  if (!ownerAddress) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json() as {
    cid: string; iv: string; wrappedItemKey: string; wrapIv: string; version: number
    label: string; category: VaultCategory; fileType: string; sizeBytes: number
  }

  const encryptedPayload: VaultItemPayload = {
    cid: body.cid,
    iv: body.iv,
    wrappedItemKey: body.wrappedItemKey,
    wrapIv: body.wrapIv,
    version: body.version,
  }

  const walletClient = getRelayerClient() as unknown as WalletClient
  const { entityKey } = await createVaultItem(walletClient, {
    encryptedPayload,
    label: body.label,
    category: body.category,
    fileType: body.fileType,
    sizeBytes: body.sizeBytes,
    ownerAddress,
  })

  return NextResponse.json({ entityKey })
}

export async function DELETE(req: NextRequest) {
  const ownerAddress = await verifyOwner(req)
  if (!ownerAddress) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { vaultItemKey } = await req.json() as { vaultItemKey: string }
  if (!vaultItemKey) return NextResponse.json({ error: "vaultItemKey required" }, { status: 400 })

  const walletClient = getRelayerClient() as unknown as WalletClient
  const { deletedGrants } = await deleteVaultItemWithGrants(
    publicClient,
    walletClient,
    vaultItemKey,
    ownerAddress
  )

  return NextResponse.json({ success: true, deletedGrants })
}
