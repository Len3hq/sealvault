import { keccak256 } from "viem"

export const SIGN_MESSAGE =
  "SealVault master key v1 — sign to unlock your vault" as const

export function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex
  if (clean.length % 2 !== 0) throw new Error("Invalid hex string length")
  const buf = new ArrayBuffer(clean.length / 2)
  const bytes = new Uint8Array(buf)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

export function bufToHex(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  return (
    "0x" +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  )
}

export async function deriveMasterKey(signature: string): Promise<CryptoKey> {
  const sigHex = (
    signature.startsWith("0x") ? signature : `0x${signature}`
  ) as `0x${string}`

  const hash = keccak256(sigHex)
  const hashBytes = hexToBytes(hash)

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    hashBytes,
    "HKDF",
    false,
    ["deriveKey"]
  )

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(32),
      info: new TextEncoder().encode("vault-master"),
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt", "wrapKey", "unwrapKey"]
  )
}
