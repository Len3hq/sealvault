# SealVault: Private Documents, Shared on Your Terms.

**The trustless document vault for sensitive files.**

SealVault is a crypto-native document vault built on Arkiv — where your files are encrypted before they leave your browser, stored on IPFS, and shared via time-scoped magic links that expire on-chain. No counterparty risk. No centralised server that can leak your data.

🌐 **Live:** [sealvault.len3.xyz](https://sealvault.len3.xyz/)
📦 **Repo:** [github.com/Len3hq/sealvault](https://github.com/Len3hq/sealvault)
📹 **Demo:** [Youtube](https://youtu.be/r0kqDukAxqM?si=hvgxhHmrEqxAnlh_)

## Why SealVault?

Cloud storage and file-sharing tools are centralised and siloed. SealVault puts document ownership and access control on-chain via Arkiv:

- **Client-side encryption** — Files are encrypted with AES-256-GCM before they leave your browser. The server never sees your plaintext or your keys.
- **Magic link sharing** — Share a document by generating a time-scoped link. The URL token *is* the decryption key — no account needed for the recipient.
- **On-chain expiry** — Access grants expire automatically on the Arkiv chain. No cron jobs, no background sweepers, no forgotten links.
- **AI vault manager** — Talk to your vault. The AI agent can list documents, create share links, revoke access, and delete files via natural language.
- **On-chain agent memory** — The agent remembers past conversations. Summaries are stored as Arkiv entities scoped to your wallet, giving it continuity across sessions without any centralised database.
- **Email login, no crypto wallet required** — Powered by Privy embedded wallets. Sign in with email; the vault key is derived from a wallet signature you never have to think about.

## Arkiv Integration

All state is stored as Arkiv entities. No traditional database.

### Entity Types (3 types, 4 subtypes)

| Entity | Subtype | Description | TTL |
|--------|---------|-------------|-----|
| `vault_item` | — | Encrypted document (IPFS CID + key material) | 10 years |
| `access_grant` | — | Time-scoped magic link (token hash + re-encrypted ciphertext CID) | 1 hour – 30 days |
| `agent_memory` | `grant_record` | Audit trail entry created alongside every share | 2 years |
| `agent_memory` | `conversation_summary` | LLM-generated session summary for persistent agent context | 1 year |

### Relationships

- `vault_item` → `access_grant` (one document, many time-scoped links)
- `access_grant` → `grant_record` (each grant has a paired audit record)
- `conversation_summary` → owner wallet (per-user agent memory, stored on-chain)

### Queryable Attributes

`project`, `type`, `subtype`, `owner`, `parent_key`, `token_hash`, `category`, `status`, `grantee_name`, `grant_entity`, `expires_at`, `granted_at`, `recorded_at`

## Features

### For Document Owners
- Upload any file type (PDF, image, video, text) — encrypted before upload
- Categorise documents: medical, legal, financial, personal
- View and download your own documents (decrypted in-browser)
- Generate time-scoped magic links with a named recipient and purpose
- Revoke or extend active links at any time
- Full transaction history of uploads and shares
- AI assistant to manage the vault conversationally

### For Recipients (no account needed)
- Open a shared document directly from the link — no login, no app install
- Live expiry countdown on the view page
- Access automatically stops working when the link expires or is revoked
- "Secured by Arkiv" attribution on every shared document

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 15 (App Router, Turbopack) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 3 + IBM Plex Mono |
| Auth / Wallets | Privy — email login, embedded EVM wallets |
| On-chain storage | Arkiv SDK — Braga testnet |
| File storage | IPFS via Pinata |
| Crypto | Web Crypto API (AES-256-GCM, HKDF, key wrapping) |
| AI Agent | Vercel AI SDK v6 + OpenAI GPT-4o-mini |
| Server state | TanStack Query v5 |
| Deploy | Vercel |

## Getting Started

### Prerequisites
- Node.js 18+
- A [Privy](https://privy.io) app ID
- A [Pinata](https://pinata.cloud) account (IPFS pinning)
- An OpenAI API key
- A funded Arkiv Braga wallet (relayer)

### Installation

```bash
git clone https://github.com/Len3hq/sealvault.git
cd sealvault
npm install
```

### Environment Variables

Create `.env.local`:

```env
# Privy
NEXT_PUBLIC_PRIVY_APP_ID=your_privy_app_id

# Arkiv relayer
NEXT_PUBLIC_RELAYER_ADDRESS=0xYourRelayerPublicAddress
RELAYER_PRIVATE_KEY=your_relayer_private_key

# IPFS
PINATA_JWT=your_pinata_jwt

# AI
OPENAI_API_KEY=your_openai_key
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Tests

```bash
npm run test        # watch mode
npm run test:run    # single run
npm run type-check  # TypeScript check
```

## Architecture

```
src/
├── app/
│   ├── page.tsx              # Landing / dashboard
│   ├── vault/                # Document management
│   ├── grants/               # Active share links
│   ├── view/[token]/         # Public grantee view (no auth)
│   ├── agent/                # AI chat interface
│   ├── memory/               # On-chain agent memory browser
│   ├── transactions/         # Activity log
│   └── api/
│       ├── relay/            # Server relay routes (relayer pays gas)
│       ├── ipfs/upload/      # Pinata upload proxy
│       ├── agent/            # GPT-4o-mini streaming endpoint
│       └── agent/memory/     # Conversation memory save endpoint
├── lib/
│   ├── arkiv/                # SDK client, queries, mutations, schemas
│   ├── crypto/               # AES-256-GCM encrypt/decrypt, key derivation
│   ├── vault/                # Grant creation flow (crypto + relay orchestration)
│   └── agent/                # System prompt, tool definitions
├── hooks/                    # useVaultAuth, useVaultItems, useAgentChat, etc.
├── contexts/                 # VaultAuthContext (master key lifecycle)
└── components/               # Nav, DocumentViewer, TxRow
```

## Built for

**Arkiv Web3 Database Builders Challenge — 2026**

Built by [@len3hq](https://github.com/Len3hq)
