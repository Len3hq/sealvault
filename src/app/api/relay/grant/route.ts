import { NextRequest, NextResponse } from "next/server"
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
import { GRANT_STATUS } from "@/lib/arkiv/constants"
import type { AccessGrantPayload } from "@/lib/arkiv/types"
import type { VaultCategory } from "@/lib/arkiv/constants"
import type { WalletClient } from "@/lib/arkiv/types"

export const runtime = "nodejs"

// POST — create magic link grant (client has already done the crypto + IPFS upload)
export async function POST(req: NextRequest) {
  const ownerAddress = await verifyOwner(req)
  if (!ownerAddress) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json() as {
    accessGrantPayload: AccessGrantPayload
    tokenHash: string
    parentVaultItemKey: string
    purpose: string
    durationSeconds: number
    granteeName: string
    category: VaultCategory
  }

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

// DELETE — revoke grant
export async function DELETE(req: NextRequest) {
  const ownerAddress = await verifyOwner(req)
  if (!ownerAddress) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { grantEntityKey } = await req.json() as { grantEntityKey: string }
  if (!grantEntityKey) return NextResponse.json({ error: "grantEntityKey required" }, { status: 400 })

  const walletClient = getRelayerClient() as unknown as WalletClient

  const grantRecord = await queryGrantRecordByGrantEntity(publicClient, grantEntityKey, ownerAddress)
  await revokeAccessGrant(walletClient, grantEntityKey)

  if (grantRecord?.payload) {
    await updateGrantRecordStatus(walletClient, grantRecord, GRANT_STATUS.REVOKED, "Manually revoked")
  }

  return NextResponse.json({ success: true })
}

// PATCH — extend grant
export async function PATCH(req: NextRequest) {
  const ownerAddress = await verifyOwner(req)
  if (!ownerAddress) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { grantEntityKey, additionalSeconds } = await req.json() as {
    grantEntityKey: string
    additionalSeconds: number
  }
  if (!grantEntityKey || !additionalSeconds) {
    return NextResponse.json({ error: "grantEntityKey and additionalSeconds required" }, { status: 400 })
  }

  const walletClient = getRelayerClient() as unknown as WalletClient
  await extendAccessGrant(walletClient, grantEntityKey, additionalSeconds)

  return NextResponse.json({ success: true })
}

// PUT — mark grant as expired (called from subscription events)
export async function PUT(req: NextRequest) {
  const ownerAddress = await verifyOwner(req)
  if (!ownerAddress) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { grantEntityKey } = await req.json() as { grantEntityKey: string }
  if (!grantEntityKey) return NextResponse.json({ error: "grantEntityKey required" }, { status: 400 })

  const walletClient = getRelayerClient() as unknown as WalletClient
  await handleGrantExpiry(publicClient, walletClient, grantEntityKey, ownerAddress)

  return NextResponse.json({ success: true })
}
