import { keccak256 } from "viem"
import type { AccessGrantPayload } from "@/lib/arkiv/types"
import { bufToHex, hexToBytes } from "./keys"

async function deriveGrantKey(token: string): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    hexToBytes(token),
    "HKDF",
    false,
    ["deriveKey"]
  )

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(32),
      info: new TextEncoder().encode("grant"),
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  )
}

export function generateGrantToken(): string {
  return bufToHex(crypto.getRandomValues(new Uint8Array(32)))
}

export function hashGrantToken(token: string): string {
  const hex = (
    token.startsWith("0x") ? token : `0x${token}`
  ) as `0x${string}`
  return keccak256(hex)
}

export async function encryptForGrant(
  content: Uint8Array<ArrayBuffer>,
  token: string
): Promise<AccessGrantPayload> {
  const grantKey = await deriveGrantKey(token)
  const iv = crypto.getRandomValues(new Uint8Array(12))

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    grantKey,
    content
  )

  return {
    grantCiphertext: bufToHex(ciphertext),
    grantIv: bufToHex(iv),
  }
}

export async function decryptGrant(
  payload: AccessGrantPayload,
  token: string
): Promise<Uint8Array<ArrayBuffer>> {
  const grantKey = await deriveGrantKey(token)

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: hexToBytes(payload.grantIv) },
    grantKey,
    hexToBytes(payload.grantCiphertext)
  )

  return new Uint8Array(plaintext)
}
