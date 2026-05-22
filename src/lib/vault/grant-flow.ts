import {
  decryptVaultItem,
  generateGrantToken,
  hashGrantToken,
  encryptForGrant,
} from "@/lib/crypto"
import {
  createAccessGrant,
  createGrantRecord,
} from "@/lib/arkiv/mutations"
import type { WalletClient, VaultItemPayload, AccessGrantPayload } from "@/lib/arkiv/types"
import type { VaultCategory } from "@/lib/arkiv/constants"
import { GRANT_STATUS } from "@/lib/arkiv/constants"

export interface CreateGrantParams {
  vaultItemPayload: VaultItemPayload
  masterKey: CryptoKey
  walletClient: WalletClient
  ownerAddress: string
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
 * 1. Decrypt the vault item content using the owner's master key
 * 2. Generate a random token (becomes the URL slug)
 * 3. Re-encrypt content under the token — grantee decrypts using only the URL
 * 4. Create Arkiv access grant entity (TTL = durationSeconds = revocation timer)
 * 5. Create Arkiv grant record entity (audit trail, outlives the grant)
 */
export async function createMagicLinkGrant(
  params: CreateGrantParams
): Promise<CreateGrantResult> {
  const {
    vaultItemPayload,
    masterKey,
    walletClient,
    ownerAddress,
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
  const grantCrypto = await encryptForGrant(
    new Uint8Array(decrypted.buffer) as Uint8Array<ArrayBuffer>,
    token
  )

  // Embed document metadata in the grant payload so grantees
  // can render the document without querying the vault item entity
  const accessGrantPayload: AccessGrantPayload = {
    ...grantCrypto,
    label,
    fileType,
  }

  // Step 4: Create the Arkiv access grant entity
  // expiresIn = durationSeconds — this IS the revocation mechanism
  const { entityKey: grantEntityKey } = await createAccessGrant(walletClient, {
    accessGrantPayload,
    tokenHash,
    parentVaultItemKey: vaultItemKey,
    grantedByAddress: ownerAddress,
    purpose,
    durationSeconds,
  })

  // Step 5: Create the audit trail record in agent memory
  // Uses a 2-year TTL so the history survives long after the grant expires
  const { entityKey: grantRecordKey } = await createGrantRecord(walletClient, {
    granteeName,
    parentVaultItemKey: vaultItemKey,
    grantEntityKey,
    status: GRANT_STATUS.ACTIVE,
    category,
    purpose,
    durationSeconds,
  })

  return { token, tokenHash, grantEntityKey, grantRecordKey }
}
