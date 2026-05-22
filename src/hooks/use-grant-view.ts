"use client"

import { useQuery } from "@tanstack/react-query"
import { publicClient } from "@/lib/arkiv/client"
import { queryGrantByTokenHash } from "@/lib/arkiv/queries"
import { getAttributeValue } from "@/lib/arkiv/schemas"
import { hashGrantToken, decryptGrant } from "@/lib/crypto"
import type { AccessGrantPayload } from "@/lib/arkiv/types"

export type GrantViewStatus =
  | "loading"
  | "not_found"
  | "active"
  | "error"

export interface GrantViewData {
  status: GrantViewStatus
  content?: Uint8Array<ArrayBuffer>
  label?: string
  fileType?: string
  purpose?: string
  grantedBy?: string
  expiresAt?: number
}

async function fetchGrantView(token: string): Promise<GrantViewData> {
  const tokenHash = hashGrantToken(token)

  const entity = await queryGrantByTokenHash(publicClient, tokenHash)

  if (!entity) {
    return { status: "not_found" }
  }

  if (!entity.payload || !entity.attributes) {
    return { status: "error" }
  }

  const attrs = entity.attributes as Array<{ key: string; value: string | number }>
  const expiresAt = getAttributeValue(attrs, "expires_at") as number | undefined
  const purpose   = getAttributeValue(attrs, "purpose")   as string | undefined
  const grantedBy = getAttributeValue(attrs, "granted_by") as string | undefined

  // Decrypt the document content using the token as key material
  const grantPayload = JSON.parse(
    new TextDecoder().decode(entity.payload)
  ) as AccessGrantPayload

  let content: Uint8Array<ArrayBuffer>
  try {
    content = await decryptGrant(grantPayload, token)
  } catch {
    return { status: "error" }
  }

  return {
    status: "active",
    content,
    label:    grantPayload.label,
    fileType: grantPayload.fileType,
    purpose,
    grantedBy,
    expiresAt,
  }
}

export function useGrantView(token: string | undefined) {
  return useQuery<GrantViewData>({
    queryKey: ["grant-view", token],
    queryFn: () => fetchGrantView(token!),
    enabled: !!token,
    staleTime: 60_000,
    retry: false, // don't retry on 404 — it won't change
  })
}
