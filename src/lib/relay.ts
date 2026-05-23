"use client"

/**
 * Sends an authenticated request to a relay API route.
 * The signature proves ownership of ownerAddress (personal_sign of SIGN_MESSAGE).
 */
export async function relayPost(
  endpoint: string,
  body: object,
  ownerAddress: string,
  signature: string
): Promise<unknown> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-owner-address": ownerAddress,
      "x-signature": signature,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(err.error ?? `${endpoint} failed (${res.status})`)
  }
  return res.json()
}

export async function relayDelete(
  endpoint: string,
  body: object,
  ownerAddress: string,
  signature: string
): Promise<unknown> {
  const res = await fetch(endpoint, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      "x-owner-address": ownerAddress,
      "x-signature": signature,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(err.error ?? `${endpoint} failed (${res.status})`)
  }
  return res.json()
}

export async function relayPatch(
  endpoint: string,
  body: object,
  ownerAddress: string,
  signature: string
): Promise<unknown> {
  const res = await fetch(endpoint, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-owner-address": ownerAddress,
      "x-signature": signature,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(err.error ?? `${endpoint} failed (${res.status})`)
  }
  return res.json()
}
