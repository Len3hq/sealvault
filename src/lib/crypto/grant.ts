import { keccak256 } from "viem"
import type { AccessGrantPayload } from "@/lib/arkiv/types"
import { fetchFromIPFS } from "@/lib/ipfs"
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
  const hex = (token.startsWith("0x") ? token : `0x${token}`) as `0x${string}`
  return keccak256(hex)
}

export interface EncryptedGrant {
  ciphertext: Uint8Array<ArrayBuffer>
  grantIv: string
}

// Returns raw ciphertext bytes separately.
// Caller uploads to IPFS and stores { grantCID, grantIv, label, fileType } on-chain.
export async function encryptForGrant(
  content: Uint8Array<ArrayBuffer>,
  token: string
): Promise<EncryptedGrant> {
  const grantKey = await deriveGrantKey(token)
  const iv = crypto.getRandomValues(new Uint8Array(12))

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    grantKey,
    content
  )

  return {
    ciphertext: new Uint8Array(ciphertext),
    grantIv: bufToHex(iv),
  }
}

// Fetches ciphertext from IPFS using payload.grantCID, then decrypts with the token.
// Legacy guard: if payload still has the old `grantCiphertext` hex field (pre-IPFS grants),
// decrypts inline without an IPFS fetch.
export async function decryptGrant(
  payload: AccessGrantPayload,
  token: string
): Promise<Uint8Array<ArrayBuffer>> {
  const grantKey = await deriveGrantKey(token)

  const ciphertext =
    "grantCID" in payload
      ? await fetchFromIPFS(payload.grantCID)
      : hexToBytes((payload as unknown as { grantCiphertext: string }).grantCiphertext)

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: hexToBytes(payload.grantIv) },
    grantKey,
    ciphertext
  )

  return new Uint8Array(plaintext)
}
