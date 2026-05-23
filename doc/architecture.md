# SealVault — Architecture

## Overview

SealVault is a trustless, encrypted document vault built on the [Arkiv Network](https://arkiv.network). Users upload files that are encrypted client-side before leaving the browser; ciphertext is stored while metadata and key material live as on-chain entities on the Arkiv Braga chain. Documents are shared via **magic links** — the URL token is the literal decryption key, so no account is needed to view a shared file and access grants have enforced on-chain expiry times. An AI agent lets users manage their vault conversationally, with **persistent on-chain memory**: after each session a structured summary is saved as an `agent_memory` entity scoped to the user's wallet, giving the agent continuity across conversations without any centralised database.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router, Turbopack) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 3 + IBM Plex Mono font |
| Auth / Wallets | Privy (`@privy-io/react-auth`) — email login, embedded EVM wallets |
| Blockchain | Arkiv Braga testnet (`@arkiv-network/sdk`) |
| IPFS | Pinata cloud — ciphertext pinning and retrieval |
| AI | Vercel AI SDK v6 (`ai`, `@ai-sdk/react`) + OpenAI GPT-4o-mini |
| Server state | TanStack Query v5 |
| Theme | next-themes (light/dark) |
| Testing | Vitest + Testing Library |
| Crypto | Web Crypto API (AES-256-GCM, HKDF, key wrapping) |
| Validation | Zod v4 |
| Ethereum utils | viem v2 (`keccak256`, `recoverMessageAddress`) |

---

## High-Level Architecture

```
Browser (client)
  ├── Privy embedded wallet  ─── signs SIGN_MESSAGE
  ├── VaultAuthContext        ─── derives CryptoKey from signature
  ├── Web Crypto API          ─── AES-256-GCM encryption/decryption
  └── Relay HTTP calls ───────────────────────────────────┐
                                                          ▼
                                              Next.js API Routes (server)
                                                ├── /api/relay/vault-item
                                                ├── /api/relay/grant
                                                ├── /api/relay/agent-memory
                                                ├── /api/ipfs/upload ──── Pinata
                                                ├── /api/agent ─────────── OpenAI stream
                                                └── /api/agent/memory ──── OpenAI + Arkiv

                                              Relayer wallet (server private key)
                                                └── signs Arkiv transactions (pays gas)
                                                          │
                                                          ▼
                                              Arkiv Braga chain (on-chain entities)
                                                ├── vault_item entities
                                                ├── access_grant entities
                                                └── agent_memory entities

IPFS (Pinata)
  ├── encrypted document ciphertext (vault_item payload)
  └── encrypted grant ciphertext (access_grant payload)
```

---

## Authentication & Key Derivation

Authentication is handled by **Privy**. Users log in with email; Privy creates an embedded EVM wallet for them automatically.

On login, `VaultAuthContext` (`src/contexts/vault-auth-context.tsx`) performs the following:

1. Calls `wallet.provider.personal_sign(SIGN_MESSAGE, address)` — a deterministic signature over a fixed string.
2. The signature is cached in `sessionStorage` to avoid re-signing on every page visit.
3. `deriveMasterKey(signature)` (`src/lib/crypto/keys.ts`) runs the signature through `keccak256`, then uses **HKDF (SHA-256)** to derive a non-extractable AES-256-GCM `CryptoKey`.

This master key never leaves the browser. It is the root of all encryption in the vault.

**Server-side auth** for relay routes uses a different mechanism: the client passes `x-owner-address` and `x-signature` headers with every relay request. The server (`src/lib/server/verify-auth.ts`) calls `recoverMessageAddress` (viem) to verify the signature matches the claimed address. No JWT, no session cookie — ownership is proven cryptographically on every request.

---

## Data Model (Arkiv Entities)

All persistent state lives as **entities** on the Arkiv Braga chain. An entity has a `payload` (arbitrary bytes, stored as JSON), `attributes` (indexed key-value pairs for querying), and a TTL (time-to-live) that controls on-chain expiry.

All entities share a `project: "sealvault"` attribute and are created by the **relayer wallet**, so `createdBy(RELAYER_ADDRESS)` filters in queries prevent spoofed entities from other wallets from surfacing.

### Entity Types

#### `vault_item`
Represents an encrypted document.

| Attribute | Value |
|---|---|
| `project` | `"sealvault"` |
| `type` | `"vault_item"` |
| `owner` | wallet address of the document owner |
| `category` | `medical` / `legal` / `financial` / `personal` |
| `label` | human-readable document name |
| `file_type` | MIME type |
| `size_bytes` | original file size |
| `created_at` | Unix timestamp (ms) |

**Payload** (JSON, stored encrypted):
```ts
{
  cid: string           // IPFS CID of the encrypted ciphertext
  iv: string            // AES-GCM IV (hex) for decrypting ciphertext
  wrappedItemKey: string // per-item AES key, wrapped (encrypted) with the master key
  wrapIv: string        // AES-GCM IV used during key wrapping
  version: 1
}
```

TTL: 10 years.

#### `access_grant`
Represents a time-scoped magic link share.

| Attribute | Value |
|---|---|
| `project` | `"sealvault"` |
| `type` | `"access_grant"` |
| `owner` | wallet address of the vault owner |
| `parent_key` | entity key of the linked `vault_item` |
| `token_hash` | `keccak256` of the magic link token |
| `purpose` | reason for sharing |
| `granted_by` | owner address |
| `granted_at` | Unix timestamp (ms) |
| `expires_at` | Unix timestamp (ms) |
| `label` | document label (for display at the view page) |
| `grantee_name` | name of the recipient |

**Payload** (JSON):
```ts
{
  grantCID: string  // IPFS CID of the re-encrypted ciphertext (token-keyed)
  grantIv: string   // AES-GCM IV (hex) for decrypting grant ciphertext
  label?: string
  fileType?: string
}
```

TTL: set at grant creation (1 hour – 30 days). Expiry is enforced on-chain.

#### `agent_memory` — subtype `grant_record`
An audit record created alongside every access grant. Survives grant expiry, forming a permanent history.

| Attribute | Notable value |
|---|---|
| `subtype` | `"grant_record"` |
| `grant_entity` | entity key of the linked `access_grant` |
| `status` | `active` / `expired` / `revoked` |
| `grantee_name` | recipient name |
| `category` | document category |

TTL: 2 years.

#### `agent_memory` — subtype `conversation_summary`
An LLM-generated summary of an agent conversation, stored on-chain so the agent has persistent memory across sessions.

| Attribute | Notable value |
|---|---|
| `subtype` | `"conversation_summary"` |
| `owner` | vault owner address |
| `recorded_at` | Unix timestamp (ms) |
| `topic` | short topic string |
| `action_count` | number of write actions taken |

**Payload** (JSON):
```ts
{
  summary: string    // 1-2 sentence recap
  keyFacts: string[] // facts about people, context
  actions: string[]  // write actions performed
}
```

TTL: 1 year.

---

## Encryption Model

### Document Upload

```
File → ArrayBuffer
  │
  ├─ generateKey() → itemKey (AES-256-GCM, random, non-extractable)
  ├─ encrypt(file, itemKey, iv) → ciphertext
  ├─ wrapKey(itemKey, masterKey, wrapIv) → wrappedItemKey
  │
  └─ Store on IPFS: ciphertext → CID
     Store on Arkiv: { cid, iv, wrappedItemKey, wrapIv, version }
```

Per-document keys mean that the master key only needs to unwrap a small key blob — large files are never re-encrypted if the master key changes.

### Document Decryption (owner)

```
Fetch entity from Arkiv → { cid, iv, wrappedItemKey, wrapIv }
  │
  ├─ unwrapKey(wrappedItemKey, masterKey, wrapIv) → itemKey
  ├─ fetchFromIPFS(cid) → ciphertext
  └─ decrypt(ciphertext, itemKey, iv) → plaintext
```

### Magic Link Grant Creation

```
Decrypt original document → plaintext
  │
  ├─ generateGrantToken() → 32 random bytes (hex) = the URL token
  ├─ hashGrantToken(token) → keccak256 hash → stored on-chain as token_hash
  ├─ deriveGrantKey(token) via HKDF → grantKey (AES-256-GCM)
  ├─ encrypt(plaintext, grantKey, grantIv) → grantCiphertext
  └─ uploadToIPFS(grantCiphertext) → grantCID
     POST /api/relay/grant → creates access_grant + grant_record entities
     Return: /view/<token>
```

The magic link token is the decryption key. Only the hash is ever stored on-chain.

### Grant Decryption (grantee / view page)

```
URL: /view/<token>
  │
  ├─ hashGrantToken(token) → tokenHash
  ├─ queryGrantByTokenHash(tokenHash) → access_grant entity (with payload)
  │    - if entity not found or expired → show "link expired" page
  ├─ deriveGrantKey(token) → grantKey
  ├─ fetchFromIPFS(grantCID) → grantCiphertext
  └─ decrypt(grantCiphertext, grantKey, grantIv) → plaintext → render
```

No authentication required. The token in the URL is the entire credential.

---

## Relay Pattern

The browser cannot sign Arkiv transactions directly (Privy's embedded wallet is not an Arkiv-native wallet). All on-chain writes go through a **Next.js API relay layer**:

1. Browser encrypts data, uploads to IPFS, then calls a relay route with the encrypted metadata.
2. The relay route verifies the caller's EVM signature (`verifyOwner`).
3. `getRelayerClient()` creates an Arkiv wallet client from `RELAYER_PRIVATE_KEY` (a server env var).
4. The relayer signs and submits the Arkiv transaction, paying gas from its own balance.

Relay routes:
- `POST /api/relay/vault-item` — create vault item entity
- `DELETE /api/relay/vault-item` — delete vault item + all child grants atomically
- `POST /api/relay/grant` — create access_grant + grant_record entities
- `DELETE /api/relay/grant` — revoke a grant, update grant record to "revoked"
- `PATCH /api/relay/grant` — extend a grant's TTL
- `PUT /api/relay/grant` — mark a naturally-expired grant as "expired"
- `DELETE /api/relay/agent-memory` — delete a conversation memory entity

---

## AI Agent

The agent is a GPT-4o-mini streaming chat session accessed at `/agent`.

**Architecture** (`src/app/api/agent/route.ts`):

```
POST /api/agent
  │
  ├─ Load owner's conversation memories from Arkiv (up to 8 recent)
  ├─ Build system prompt with memory context
  └─ streamText(gpt-4o-mini, tools, messages)
       ├─ Read tools (server-executed)
       │    ├─ list_vault_items   → queryVaultItems(publicClient, owner)
       │    ├─ list_active_grants → queryActiveGrantsByOwner(publicClient, owner)
       │    └─ query_grant_history → queryGrantHistory(publicClient, owner)
       └─ Write tool schemas (client-intercepted, no execute fn)
            ├─ grant_access
            ├─ revoke_access
            ├─ extend_access
            └─ delete_vault_item
```

**Write tool execution** happens client-side in `useAgentChat` (`src/hooks/use-agent-chat.ts`) via `onToolCall`. Write tools require the `masterKey` and `signature` that only exist in the browser. The hook intercepts tool calls, performs the crypto + relay operations, and feeds the result back to the AI stream via `addToolOutput`.

**Agent memory** is saved automatically when a conversation goes idle (`POST /api/agent/memory`). The server runs `generateObject(gpt-4o-mini)` to decide whether the conversation is worth saving and to extract a structured summary. If it is, the summary is saved as an `agent_memory` entity on-chain via the relayer.

---

## Pages & Routes

| Route | Description |
|---|---|
| `/` | Landing page (unauthenticated) or dashboard with stats + recent docs + transaction feed |
| `/vault` | Document management — upload, view, share, delete with category filtering |
| `/grants` | Active share links — revoke or extend grants, expiry urgency badges |
| `/view/[token]` | Public grantee view — no login required; decrypts and renders the shared document |
| `/agent` | AI chat interface with tool call visualization |
| `/memory` | Inspect and delete on-chain agent memory entries |
| `/transactions` | Full upload + share activity log |

---

## Hooks

| Hook | Purpose |
|---|---|
| `useVaultAuth` | Provides `masterKey`, `signature`, `walletAddress`, Privy auth state |
| `useVaultItems` | TanStack Query wrapper for `queryVaultItems` |
| `useActiveGrants` | TanStack Query wrapper for `queryActiveGrantsByOwner` |
| `useGrantActions` | `useMutation` wrappers for create/revoke/extend grants via relay |
| `useGrantView` | Fetches and decrypts a shared document from a grant token (for `/view/[token]`) |
| `useGrantExpiry` | WebSocket subscription to Arkiv chain events; marks grants expired on-chain when TTL fires |
| `useAgentChat` | Extends `useChat` with client-side write tool execution and memory auto-save |

---

## Key Design Decisions

**Zero-knowledge of ciphertext on the server.** The server never sees plaintext or the master key. All symmetric crypto runs in the browser via Web Crypto API. The relay only handles encrypted blobs and metadata.

**Magic links as bearer tokens.** The share URL token is derived into the AES key via HKDF. Only the `keccak256` hash is stored on-chain. A compromised server cannot reconstruct the decryption key from on-chain data alone.

**Relayer pattern for gas abstraction.** Users never need to hold crypto tokens or sign blockchain transactions. The app is accessed via email login; gas is paid by the relayer wallet. Authentication is the EVM signature (used for key derivation), re-used to authorize relay requests.

**On-chain TTL for grant expiry.** Arkiv enforces entity expiry natively. There is no cron job or background sweeper. When an entity's TTL expires, it is automatically removed from the Arkiv indexer, and `queryActiveGrantsByOwner` stops returning it. The `useGrantExpiry` hook listens to chain events and updates the `grant_record` status in the audit trail.

**Split agent tools.** Read tools run server-side (no master key needed — just a public client and owner address). Write tools have no `execute` function; their schemas are sent to the model, but execution is intercepted client-side where `masterKey` and `signature` are available.

**Per-document keys + key wrapping.** Each document has a unique AES key. The master key never encrypts document content directly — it only wraps/unwraps per-document keys. This limits blast radius if a document key is ever compromised, and makes future key rotation feasible without re-encrypting all documents.

---

## Environment Variables

| Variable | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_PRIVY_APP_ID` | client | Privy project identifier |
| `NEXT_PUBLIC_RELAYER_ADDRESS` | client | Public address of the relayer wallet (used to filter Arkiv queries) |
| `RELAYER_PRIVATE_KEY` | server | Private key for the relayer wallet that signs Arkiv transactions |
| `PINATA_JWT` | server | API key for uploading files to Pinata / IPFS |
| `OPENAI_API_KEY` | server | API key for GPT-4o-mini (agent + memory summarization) |
