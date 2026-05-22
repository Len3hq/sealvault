# Phase 4 — AI Agent with Streaming Chat

## What Was Built

Phase 4 is the intelligent layer that makes SealVault conversational. An AI agent (powered by Claude Opus 4.7) can query the owner's vault, reason about their documents, and execute write operations — all through natural language chat. The critical design constraint: write operations that need the owner's master key (grant, revoke, delete) execute inside the owner's browser, never on the server.

### Files added or modified

```
src/
├── lib/
│   ├── agent/
│   │   ├── system-prompt.ts         — NEW: system prompt builder
│   │   └── tools.ts                 — NEW: 4 read tools + 5 write tool schemas
│   └── arkiv/
│       └── mutations/
│           ├── agent-memory.ts      — NEW: saveContact mutation
│           └── index.ts             — updated: exports saveContact
├── hooks/
│   ├── use-arkiv-wallet.ts          — NEW: WalletArkivClient from Privy provider
│   └── use-agent-chat.ts            — NEW: useChat with client-side write tool execution
└── app/
    ├── api/
    │   └── agent/
    │       └── route.ts             — NEW: streaming POST route
    └── agent/
        └── page.tsx                 — NEW: streaming chat UI
```

---

### 1. System Prompt (`src/lib/agent/system-prompt.ts`)

`buildSystemPrompt()` returns a dynamic system prompt that includes today's date. Key behavioral rules baked in:

- **Verify before writing** — always confirm document and grantee before creating or revoking grants
- **Never invent entity keys** — must call `list_vault_items` or `list_active_grants` first
- **Time in seconds** — agent knows that 1 hour = 3600, 1 day = 86400, etc.
- **Magic link warning** — reminds users the URL IS the decryption key; copy it immediately
- **One write at a time** — no batching multiple mutations in one response turn

---

### 2. Tool Definitions (`src/lib/agent/tools.ts`)

9 tools total, split by where they execute:

#### Read tools — 4, server-side (have `execute`)

| Tool | Arkiv query | Returns |
|---|---|---|
| `list_vault_items` | `queryVaultItems` | key, label, category, fileType, sizeBytes, createdAt |
| `list_active_grants` | `queryActiveGrantsByOwner` | grantEntityKey, parentVaultItemKey, purpose, expiresAt |
| `lookup_contact` | `queryContacts` | name, email, tags, notes |
| `query_grant_history` | `queryGrantHistory` | granteeName, status, outcome, summary |

Read tools run server-side because they only need the owner's wallet address (public), not the master key.

#### Write tools — 5, client-side (no `execute`, handled via `onToolCall`)

| Tool | What it does |
|---|---|
| `grant_access` | Calls `createMagicLinkGrant` — decrypts vault item, re-encrypts for token, creates Arkiv grant entity |
| `revoke_access` | Calls `revokeAccessGrant` + `updateGrantRecordStatus` |
| `extend_access` | Calls `extendAccessGrant` |
| `save_contact` | Calls `saveContact` (new Phase 4 mutation) |
| `delete_vault_item` | Calls `deleteVaultItemWithGrants` — atomically removes document + all child grants |

All use `zodSchema()` from the AI SDK for input validation. The AI SDK v6 uses `inputSchema` (not `parameters`) and `stopWhen: stepCountIs(N)` (not `maxSteps`).

---

### 3. API Route (`src/app/api/agent/route.ts`)

```
POST /api/agent
Body: { messages: UIMessage[], ownerAddress: string }
```

```typescript
const result = streamText({
  model: anthropic("claude-opus-4-7"),
  system: buildSystemPrompt(),
  messages: await convertToModelMessages(messages),  // ← async in v6
  tools: { ...readTools, ...writeToolSchemas },
  stopWhen: stepCountIs(10),                         // ← v6 API, not maxSteps
})
return result.toUIMessageStreamResponse()
```

The route is stateless. The `ownerAddress` comes from the request body and is used only for Arkiv queries — no key material ever touches the server.

---

### 4. Wallet Hook (`src/hooks/use-arkiv-wallet.ts`)

`useArkivWallet()` creates a `WalletArkivClient` wired to the Privy embedded wallet:

```typescript
createWalletClient({
  chain: braga,
  transport: custom({
    request: async (args) => {
      const provider = await embeddedWallet.getEthereumProvider()
      return provider.request(args)
    },
  }),
})
```

Memoized by wallet address — no recreation on every render.

---

### 5. Agent Chat Hook (`src/hooks/use-agent-chat.ts`)

`useAgentChat({ masterKey, walletAddress, walletClient })` wraps AI SDK's `useChat` with the write tool execution pattern.

**Key architectural decisions:**

**Transport with dynamic body:**
```typescript
new DefaultChatTransport({
  api: "/api/agent",
  prepareSendMessagesRequest: ({ body }) => ({
    body: { ...(body ?? {}), ownerAddress: walletAddressRef.current },
  }),
})
```
Uses `prepareSendMessagesRequest` (not `body`) because `useChat` doesn't accept `body` at the top level in AI SDK v6. A ref ensures the latest `walletAddress` is always sent without recreating the transport.

**Write tool execution via `onToolCall` + `addToolOutput`:**
```
Agent emits write tool call (no execute on server)
      ↓
Client's onToolCall fires with { toolName, toolCallId, args }
      ↓
Client fetches vault item payload, decrypts, re-encrypts → createMagicLinkGrant
      ↓
addToolOutput({ tool, toolCallId, output: { magicLink, ... } })
      ↓
sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls
      ↓
Agent receives result, composes final response ("Here is your magic link: ...")
```

**Ref pattern for `addToolOutput`:**
`onToolCall` is a callback defined at mount time. To avoid stale closures, `addOutputRef.current` is updated each render cycle with the latest `addToolOutput` from `useChat`. The async `onToolCall` handler reads from the ref, not from a closure.

---

### 6. Chat UI (`src/app/agent/page.tsx`)

Streaming chat interface at `/agent`. Three states:
- Not logged in → sign-in prompt
- Vault unlocking → spinner
- Ready → chat interface

**Message rendering** uses AI SDK v6 helper functions:
- `isTextUIPart(part)` to extract text
- `isToolUIPart(part)` to detect tool invocations
- `getToolName(part)` to get the tool name from the `type: "tool-${name}"` field

**Tool badge states:**
| State | Badge |
|---|---|
| `input-streaming` / `input-available` | Spinning indicator + tool name |
| `output-available` | Green checkmark + magic link (if grant) |
| `output-error` | Red failure badge + error text |

**Magic link display:** When `grant_access` completes, the magic link appears inline in the chat as a clickable link the user can copy and share.

---

## How This Helps Users

**"Share my medical records with Dr. Smith for 48 hours."**
The agent calls `list_vault_items` (server), finds the medical records, asks the owner to confirm, then `grant_access` (client) decrypts and re-encrypts the document, creates the Arkiv grant entity, and returns a magic link — all in one conversation turn.

**"Who still has access to my files?"**
The agent calls `list_active_grants`, formats the results in plain English: "Dr. Smith has access to your Lab Results until tomorrow at 3 PM."

**"Revoke the link I gave to Dr. Jones."**
The agent calls `list_active_grants` to find the grant key, confirms with the user, then `revoke_access` deletes the Arkiv entity. Within seconds, the link is dead.

**"Save my accountant Mark Chen."**
The agent calls `save_contact`, creating an Arkiv entity with a 5-year TTL. Next time: "Grant my accountant access to my tax documents" → the agent calls `lookup_contact("Mark")` and uses his details automatically.

The owner never touches entity keys, never thinks about TTLs, never manages blockchain state directly. The agent handles all of it.

---

## Tests Run and Passed

**22 new tests — all passed. Total: 146 tests (8 test files).**

```
✓ src/__tests__/agent/tools.test.ts   (22 tests)
```

### tools.test.ts — 22 tests

**Write tool schema validation (10 tests — 2 per tool):**
Each write tool is verified to have a description, an `inputSchema`, and NO `execute` function. The absence of `execute` is what causes the AI SDK to route these tool calls to the client.

**Read tool execution (8 tests):**

| Test | What it verifies |
|---|---|
| list_vault_items returns [] for empty vault | No panic on empty results |
| list_vault_items maps attributes to clean shape | label, category, fileType extracted correctly |
| list_vault_items has execute (server-side) | Read tools actually have execute |
| list_active_grants returns [] | No panic on empty results |
| list_active_grants maps grant attributes | grantEntityKey, parentVaultItemKey extracted correctly |
| lookup_contact returns contact with parsed payload | JSON payload decoded, tags split on comma |
| query_grant_history returns records with outcome | Payload deserialized, outcome field present |

**Tool inventory (4 tests):**
- Exactly 4 read tools
- Exactly 5 write tool schemas
- All write tools have no execute
- All read tools have execute

---

## AI SDK v6 Patterns Used

This phase required navigating several AI SDK v6 API changes from older versions:

| Old API | AI SDK v6 API |
|---|---|
| `tool({ parameters: ... })` | `tool({ inputSchema: zodSchema(...) })` |
| `maxSteps: N` | `stopWhen: stepCountIs(N)` |
| `convertToModelMessages(messages)` | `await convertToModelMessages(messages)` (now async) |
| `body: { ... }` in `useChat` | `prepareSendMessagesRequest` in transport |
| `addToolResult(...)` | `addToolOutput(...)` (former deprecated) |
| Tool part: `part.toolInvocation.toolName` | Tool part: `getToolName(part)` + direct `state`/`output` access |
| `isLoading` from `useChat` | `status === "streaming" \| "submitted"` |

---

## Recommended Improvements

### High priority (before Phase 5)

**1. ANTHROPIC_API_KEY environment variable.**
The API route uses `anthropic("claude-opus-4-7")` which requires `ANTHROPIC_API_KEY`. Add this to `.env.local` and document it in the setup guide.

**2. Confirm dangerous writes.**
`grant_access` and `delete_vault_item` should require explicit user confirmation in the chat before executing. Currently the agent verifies intent conversationally, but there's no hard confirmation gate. Add a `needsApproval: true` flag to the write tools to use AI SDK's built-in approval flow.

**3. Grant output includes full link.**
Currently, after `grant_access`, the magic link appears in the tool badge. It should also appear in the agent's text response so the user can copy it from the message — not just the badge.

### Medium priority

**4. Stream tool progress.**
Long-running operations (large file decryption) give no progress feedback. Stream a "Decrypting…" status via `onChunk` and forward it as data to the client.

**5. Chat history persistence.**
`useAgentChat` uses in-memory messages — refreshing the page resets the conversation. Persist to `localStorage` with `sessionStorage` as fallback, keyed by wallet address.

**6. Tool result caching.**
`list_vault_items` and `list_active_grants` query Arkiv on every tool call. Cache results for 30 seconds using TanStack Query so repeated "what documents do I have?" in one session don't hammer the RPC.

### Low priority

**7. Multi-tool responses.**
The agent sometimes needs two reads before one write (e.g., `list_vault_items` then `lookup_contact` then `grant_access`). The current `stopWhen: stepCountIs(10)` allows this but the UI shows each tool call as a separate badge. Group sequential tool calls from one response step into a single visual block.

**8. Agent memory for context.**
The agent has no memory between sessions — if the owner mentioned their accountant's name last week, the agent doesn't remember. Implement a short-term context entity in Arkiv (TTL = 30 days) to carry session summaries between conversations.
