# SealVault — Hackathon Assessment

## Overall Verdict: Strong Contender, But Blocked on 3 Submission Requirements

The technical quality here is genuinely excellent — it will stand out among hackathon entries. But there are hard submission blockers that must be resolved first, and then a set of improvements that would push you from "qualified entry" to "winner."

---

## What You've Built (and How It Scores)

**Arkiv requirements — all met and exceeded:**

| Requirement | Status |
|---|---|
| `PROJECT_ATTRIBUTE = "sealvault"` on every entity/query | ✅ Verified |
| At least 2 entity types | ✅ Has 4: `vault_item`, `access_grant`, `agent_memory/grant_record`, `agent_memory/contact` |
| Advanced SDK usage (live events, batch, extension, `.createdBy()`) | ✅ All four |
| Injection protection via `.createdBy(RELAYER_ADDRESS)` | ✅ Implemented |

**Architecture strengths that judges will notice:**
- **TTL-as-revocation** is a genuine insight. No cron jobs, no smart contracts — Arkiv's expiry IS the revocation mechanism. This is novel.
- **Real cryptography** — AES-256-GCM with per-item key wrapping + HKDF. Not "we encrypt with a password."
- **Zero crypto UX** — Social login via Privy, relayer pays all gas, grantees need no wallet at all. Extremely rare in hackathon submissions.
- **Agent memory on-chain** — Contacts and grant history persist on Arkiv across sessions. This genuinely demonstrates "AI agents whose memory you own" — not localStorage, not a database.

---

## BLOCKING — Must Fix Before Submission

### 1. No README exists
**This is a hard disqualification risk.** The submission form requires "README with setup instructions." Creating this is the single most urgent task.

### 2. Not deployed
No demo link = cannot win. You need a Vercel deployment before submitting.

### 3. GitHub repo needs to be public
The repo must be open-source and publicly accessible for judging.

---

## High-Impact Improvements (Would meaningfully increase chances)

### A. Grantee name missing from Grants page
The biggest UX gap. The Grants page shows a truncated entity key (`doc: 0x1234...`) and a purpose but can't show who you shared with by name. That's because the `access_grant` entity stores `granted_by` (the owner) but not `grantee_name`. The name lives only in the `grant_record` entity.

**Fix:** Add `{ key: "grantee_name", value: granteeName }` to `buildAccessGrantEntity()` in `src/lib/arkiv/schemas/access-grant.ts`, and update the Grants page to display it. The grant card should read "Dr. Smith — Blood Work 2026 — expires in 5h" not "doc: 0x1a2b3c..."

### B. Document label missing from Grants page
Same issue — the grant card shows the raw parent entity key instead of the document name. Store `label` as an attribute on the grant entity at creation time (simplest fix, no extra queries needed).

### C. Add an Arkiv Explorer link in the UI
Judges want to verify on-chain data. A subtle "View on Arkiv Explorer" link for vault items and grants proves the data really lives on Arkiv, not in a hidden DB.

### D. Make the Agent's welcome message context-aware
The agent currently starts blank. A first-load message like "You have 4 documents and 2 active shares — 1 expires in 2 hours. What would you like to do?" immediately demonstrates the agent's memory capabilities before a judge types anything.

### E. Text search on the Vault page
Category filtering exists but no search. A label search using Arkiv's glob query (`~` operator) is a one-screen feature that showcases the query layer.

---

## Smaller Polish Items

- The `@ai-sdk/openai` package in `package.json` appears unused (agent uses Claude) — remove it to avoid confusion
- The Grants page has no category filter but the Vault page does — inconsistent
- The agent's 3 suggested prompts are generic — make them specific: "Who has access to my documents right now?", "Save Dr. Smith as a contact", "Share my blood work for 48 hours"
- Add Arkiv network attribution visibly on the grantee view page — judges visiting `/view/[token]` should see Arkiv mentioned

---

## Priority Order

1. **README.md** — write it today, it's a hard requirement
2. **Deploy to Vercel** — get the demo link
3. **Make GitHub repo public**
4. **Add `grantee_name` and `label` attributes to the access_grant entity** — fixes the confusing Grants page in one schema change
5. **Arkiv Explorer links** — high signal-to-effort ratio
6. **Context-aware agent welcome message**
7. **Text search on vault page**

---

## Why This Can Win

The core of this project — TTL-as-revocation architecture, real AES-256-GCM encryption, agent memory on Arkiv — is genuinely strong. The risk isn't the code quality; it's the submission requirements. Fix the three blockers and this is a legitimate contender.
