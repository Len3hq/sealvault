import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { verifyOwner } from "@/lib/server/verify-auth"
import { getRelayerClient } from "@/lib/arkiv/server-client"
import { publicClient } from "@/lib/arkiv/client"
import {
  createAccessGrant,
  createGrantRecord,
  revokeAccessGrant,
  extendAccessGrant,
  updateGrantRecordStatus,
} from "@/lib/arkiv/mutations"
import { queryGrantRecordByGrantEntity } from "@/lib/arkiv/queries"
import { handleGrantExpiry } from "@/lib/arkiv/mutations/lifecycle"
import { GRANT_STATUS, VAULT_CATEGORIES } from "@/lib/arkiv/constants"
import type { WalletClient } from "@/lib/arkiv/types"

export const runtime = "nodejs"

const AccessGrantPayloadSchema = z.object({
  grantCID: z.string().min(1),
  grantIv:  z.string().min(1),
  label:    z.string().optional(),
  fileType: z.string().optional(),
})

const PostBodySchema = z.object({
  accessGrantPayload: AccessGrantPayloadSchema,
  tokenHash:          z.string().min(1),
  parentVaultItemKey: z.string().min(1),
  purpose:            z.string().min(1),
  durationSeconds:    z.number().int().positive(),
  granteeName:        z.string().min(1),
  category:           z.enum(VAULT_CATEGORIES),
})

const DeleteBodySchema = z.object({
  grantEntityKey: z.string().min(1),
})

const PatchBodySchema = z.object({
  grantEntityKey:    z.string().min(1),
  additionalSeconds: z.number().int().positive(),
})

const PutBodySchema = z.object({
  grantEntityKey: z.string().min(1),
})

export async function POST(req: NextRequest) {
  const ownerAddress = await verifyOwner(req)
  if (!ownerAddress) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = PostBodySchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const body = parsed.data

  const walletClient = getRelayerClient() as unknown as WalletClient

  const { entityKey: grantEntityKey } = await createAccessGrant(walletClient, {
    accessGrantPayload: body.accessGrantPayload,
    tokenHash: body.tokenHash,
    parentVaultItemKey: body.parentVaultItemKey,
    grantedByAddress: ownerAddress,
    purpose: body.purpose,
    durationSeconds: body.durationSeconds,
  })

  const { entityKey: grantRecordKey } = await createGrantRecord(walletClient, {
    granteeName: body.granteeName,
    parentVaultItemKey: body.parentVaultItemKey,
    grantEntityKey,
    status: GRANT_STATUS.ACTIVE,
    category: body.category,
    purpose: body.purpose,
    durationSeconds: body.durationSeconds,
    ownerAddress,
  })

  return NextResponse.json({ grantEntityKey, grantRecordKey })
}

export async function DELETE(req: NextRequest) {
  const ownerAddress = await verifyOwner(req)
  if (!ownerAddress) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = DeleteBodySchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const { grantEntityKey } = parsed.data

  const walletClient = getRelayerClient() as unknown as WalletClient
  const grantRecord = await queryGrantRecordByGrantEntity(publicClient, grantEntityKey, ownerAddress)
  await revokeAccessGrant(walletClient, grantEntityKey)

  if (grantRecord?.payload) {
    await updateGrantRecordStatus(walletClient, grantRecord, GRANT_STATUS.REVOKED, "Manually revoked")
  }

  return NextResponse.json({ success: true })
}

export async function PATCH(req: NextRequest) {
  const ownerAddress = await verifyOwner(req)
  if (!ownerAddress) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = PatchBodySchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const { grantEntityKey, additionalSeconds } = parsed.data

  const walletClient = getRelayerClient() as unknown as WalletClient
  await extendAccessGrant(walletClient, grantEntityKey, additionalSeconds)

  return NextResponse.json({ success: true })
}

export async function PUT(req: NextRequest) {
  const ownerAddress = await verifyOwner(req)
  if (!ownerAddress) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = PutBodySchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const walletClient = getRelayerClient() as unknown as WalletClient
  await handleGrantExpiry(publicClient, walletClient, parsed.data.grantEntityKey, ownerAddress)

  return NextResponse.json({ success: true })
}
