# Arkiv Network — Hackathon Reference

## What is Arkiv?

Arkiv is a **universal data layer for Ethereum** — a decentralized, serverless, permissionless platform that gives Web3 apps SQL-like queryable, time-scoped, tamper-proof storage without traditional databases or centralized backends.

> "Build applications with queryable, time-scoped, and tamper-proof data on Ethereum."

It bridges the gap between Web2 usability (CRUD, queries, indexing) and Web3 trustlessness (on-chain commitments, wallet ownership, no lock-in).

---

## The Problem It Solves

Traditional dApps either:
- Store everything on-chain (expensive, unqueryable, permanent)
- Fall back to centralized databases (breaks decentralization)

Arkiv offers a third path: **DB-Chains** — high-performance, queryable database chains anchored to Ethereum, with automatic data expiration to keep costs low.

---

## Architecture (3 Layers)

```
Your App
   ↓
DB-Chains (Layer 3)         ← CRUD ops, indexed queries, programmable expiration
   ↓
Arkiv Coordination Layer (L2) ← DB-chain registry, deterministic query resolution
   ↓
Ethereum Mainnet (L1)       ← Proof verification, commitments, authoritative record
```

- **L1 (Ethereum):** Stores proofs and commitments; source of truth for ownership and integrity.
- **L2 (Arkiv Coordination Layer):** Routes queries, manages the DB-chain registry.
- **L3 (DB-Chains):** Where data actually lives — high-throughput CRUD with 2-second block times.

Apps interact via the **TypeScript SDK** or **JSON-RPC API**.

---

## Core Concepts

### Entity
The fundamental data unit. Each entity contains:
- `payload` — JSON, text, or binary data
- `attributes` — queryable key-value metadata
- `expiresIn` — TTL in seconds (auto-pruned after expiry)
- `contentType` — MIME type of the payload (e.g. `"application/json"`)

### Attributes
Two types of queryable metadata:
- **String attributes** — equality (`eq`) and glob/pattern matching (`~`)
- **Numeric attributes** — range queries (`gt`, `lt`, `gte`, `lte`)

### ExpiresIn
Data automatically expires and is pruned. Pay only for storage duration. Over-allocating wastes fees — start short, extend if needed via `extendEntity()`.

Always use the `ExpirationTime` helper from `@arkiv-network/sdk/utils` — never hardcode raw second values:
```typescript
import { ExpirationTime } from "@arkiv-network/sdk/utils"

ExpirationTime.fromMinutes(30)  // 1800
ExpirationTime.fromHours(48)    // 172800
ExpirationTime.fromDays(30)     // 2592000
ExpirationTime.fromYears(2)     // 63072000
```

### Query Language
SQL-inspired, chainable operators:
```
&&  ||  !  <  >  <=  >=  ~(glob)
```

### Clients
| Client | Use case |
|--------|----------|
| `WalletClient` | Read + Write (requires private key or MetaMask) |
| `PublicClient` | Read-only (safe for frontend, no key needed) |

### Owner vs. Creator
- `$owner` — current holder; can change via `changeOwnership()`
- `$creator` — immutable; always the original address that created the entity

---

## Developer SDK

### Installation
```bash
npm install @arkiv-network/sdk
```

### Read (PublicClient)
```typescript
import { createPublicClient, http } from "@arkiv-network/sdk"
import { braga } from "@arkiv-network/sdk/chains"
import { eq, gt } from "@arkiv-network/sdk/query"

const client = createPublicClient({ chain: braga, transport: http() })

const results = await client
  .buildQuery()
  .where(eq('type', 'note'))
  .where(gt('priority', 3))
  .withPayload(true)
  .withAttributes(true)
  .orderBy('priority', 'number', 'desc')
  .limit(50)
  .fetch()
```

### Write (WalletClient)
```typescript
import { ExpirationTime, jsonToPayload } from "@arkiv-network/sdk/utils"

// Create
const { entityKey } = await walletClient.createEntity({
  payload: jsonToPayload({ title: "Hello Arkiv" }),
  contentType: "application/json",
  attributes: [{ key: "type", value: "note" }, { key: "priority", value: 5 }],
  expiresIn: ExpirationTime.fromDays(7),
})

// Update (full replacement — resend all attributes or they are dropped)
await walletClient.updateEntity({ entityKey, payload: jsonToPayload({...}), contentType: "application/json", attributes: [...], expiresIn: ExpirationTime.fromDays(7) })

// Delete
await walletClient.deleteEntity({ entityKey })

// Transfer ownership
await walletClient.changeOwnership({ entityKey, newOwner: "0x..." })

// Batch ops (creates, updates, deletes, extensions — all in one transaction)
await walletClient.mutateEntities({
  creates: [...entityParams],
  deletes: [{ entityKey: "0x..." }, { entityKey: "0x..." }],
})
```

### Pagination
Cursor-based, up to 200 results per page:
```typescript
while (page.hasNextPage()) { page = await page.next() }
```

---

## Networks

### Braga (Current Testnet)
| Property | Value |
|----------|-------|
| Chain ID | `60138453102` |
| Native Token | GLM (test) |
| Block Time | 2 seconds |
| RPC HTTP | `https://braga.hoodi.arkiv.network/rpc` |
| RPC WebSocket | `wss://braga.hoodi.arkiv.network/rpc/ws` |
| Explorer | `explorer.braga.hoodi.arkiv.network` |
| Faucet | `braga.hoodi.arkiv.network/faucet` |
| Bridge UI | `braga.hoodi.arkiv.network/bridgette` |
| Bridge Contract | `0xB52b417A79c9dE21ffe221dF9a3821B7EaC60813` |

> Braga replaces the deprecated **Kaolin** testnet (sunset May 15, 2026).

---

## Available SDKs & APIs

- **TypeScript/JavaScript SDK** — `@arkiv-network/sdk` (primary, full-featured)
- **Python SDK** — `arkiv-sdk-python`
- **Rust SDK** — `arkiv-sdk-rust`
- **JSON-RPC API** — direct HTTP access for any language

---

## Use Cases

| Use Case | How Arkiv Fits |
|----------|---------------|
| User sessions / auth state | Short-lived entities with TTL, no backend needed |
| Event analytics | Write events on-chain, query by time/type, auto-expire |
| File/media metadata | Store CIDs + metadata with ownership; query by tag |
| Collaborative apps | Transfer ownership of entities between wallets |
| Full-stack dApps | Replace centralized DB with wallet-native queryable storage |
| Clipboards / temp data | Set expiry in minutes; zero cleanup code needed |

---

## Key Differentiators

- **No permanent storage bloat** — data expires automatically, keeping fees predictable
- **SQL-like queries without indexers** — no Graph Protocol setup, no subgraphs, no centralized indexer
- **Wallet-native ownership** — entities are owned by addresses, transferable like assets
- **Tamper-proof** — commitments anchored to Ethereum L1
- **Serverless** — no backend infrastructure required; works entirely from frontend + wallet
- **Multi-language SDKs** — JS, Python, Rust
- **Ethereum-native** — runs on EVM-compatible infrastructure (OP Stack based)

---

## Repo & Community

- **GitHub:** https://github.com/arkiv-network (80+ repos)
- **Discord:** https://discord.gg/arkiv
- **Docs:** https://docs.arkiv.network
- **Origins:** Emerged from the Golem Network ecosystem; now independent infrastructure

### Core Repos
| Repo | Description |
|------|-------------|
| `arkiv-sdk-js` | TypeScript SDK |
| `arkiv-sdk-python` | Python SDK |
| `arkiv-sdk-rust` | Rust SDK |
| `arkiv-op-geth` | Go execution client |
| `arkiv-op-reth` | Rust execution client |
| `rollups` | L2/L3 rollup infrastructure |
| `arkiv-chain-indexer` | Chain indexer (TypeScript) |
| `arkiv-starlight-docs` | MDX documentation site |
