import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { verifyOwner } from "@/lib/server/verify-auth"
import { getRelayerClient } from "@/lib/arkiv/server-client"
import { publicClient } from "@/lib/arkiv/client"
import { createVaultItem, deleteVaultItemWithGrants } from "@/lib/arkiv/mutations"
import { VAULT_CATEGORIES } from "@/lib/arkiv/constants"
import type { WalletClient } from "@/lib/arkiv/types"

export const runtime = "nodejs"

const PostBodySchema = z.object({
  cid:            z.string().min(1),
  iv:             z.string().min(1),
  wrappedItemKey: z.string().min(1),
  wrapIv:         z.string().min(1),
  version:        z.number().int().positive(),
  label:          z.string().min(1),
  category:       z.enum(VAULT_CATEGORIES),
  fileType:       z.string().min(1),
  sizeBytes:      z.number().int().nonnegative(),
})

const DeleteBodySchema = z.object({
  vaultItemKey: z.string().min(1),
})

export async function POST(req: NextRequest) {
  const ownerAddress = await verifyOwner(req)
  if (!ownerAddress) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = PostBodySchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const body = parsed.data

  const walletClient = getRelayerClient() as unknown as WalletClient
  const { entityKey } = await createVaultItem(walletClient, {
    encryptedPayload: {
      cid: body.cid, iv: body.iv,
      wrappedItemKey: body.wrappedItemKey, wrapIv: body.wrapIv,
      version: body.version,
    },
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

  const parsed = DeleteBodySchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const walletClient = getRelayerClient() as unknown as WalletClient
  const { deletedGrants } = await deleteVaultItemWithGrants(
    publicClient,
    walletClient,
    parsed.data.vaultItemKey,
    ownerAddress
  )

  return NextResponse.json({ success: true, deletedGrants })
}
