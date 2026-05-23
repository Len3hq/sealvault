import {
  decryptVaultItem,
  generateGrantToken,
  hashGrantToken,
  encryptForGrant,
} from "@/lib/crypto"
import { uploadToIPFS } from "@/lib/ipfs"
import { relayPost } from "@/lib/relay"
import type { VaultItemPayload, AccessGrantPayload } from "@/lib/arkiv/types"
import type { VaultCategory } from "@/lib/arkiv/constants"

export interface CreateGrantParams {
  vaultItemPayload: VaultItemPayload
  masterKey: CryptoKey
  ownerAddress: string
  signature: string
  vaultItemKey: string
  label: string
  fileType: string
  category: VaultCategory
  granteeName: string
  purpose: string
  durationSeconds: number
}

export interface CreateGrantResult {
  token: string
  tokenHash: string
  grantEntityKey: string
  grantRecordKey: string
}

/**
 * Full grant creation flow:
 * 1–4  Client-side crypto (decrypt → generate token → re-encrypt → IPFS upload)
 * 5–6  Server-side relay writes the Arkiv entities (relayer pays gas)
 */
export async function createMagicLinkGrant(
  params: CreateGrantParams
): Promise<CreateGrantResult> {
  const {
    vaultItemPayload,
    masterKey,
    ownerAddress,
    signature,
    vaultItemKey,
    label,
    fileType,
    category,
    granteeName,
    purpose,
    durationSeconds,
  } = params

  // Step 1: Decrypt the original document content
  const decrypted = await decryptVaultItem(vaultItemPayload, masterKey)

  // Step 2: Generate magic link token and derive its hash
  const token = generateGrantToken()
  const tokenHash = hashGrantToken(token)

  // Step 3: Re-encrypt content under the token key
  const { ciphertext: grantCiphertext, grantIv } = await encryptForGrant(
    new Uint8Array(decrypted.buffer) as Uint8Array<ArrayBuffer>,
    token
  )

  // Step 4: Upload ciphertext to IPFS (server route keeps PINATA_JWT hidden)
  const grantCID = await uploadToIPFS(grantCiphertext)

  const accessGrantPayload: AccessGrantPayload = { grantCID, grantIv, label, fileType }

  // Step 5–6: Relay creates both Arkiv entities (relayer pays gas)
  const { grantEntityKey, grantRecordKey } = await relayPost(
    "/api/relay/grant",
    {
      accessGrantPayload,
      tokenHash,
      parentVaultItemKey: vaultItemKey,
      purpose,
      durationSeconds,
      granteeName,
      category,
    },
    ownerAddress,
    signature
  ) as { grantEntityKey: string; grantRecordKey: string }

  return { token, tokenHash, grantEntityKey, grantRecordKey }
}
