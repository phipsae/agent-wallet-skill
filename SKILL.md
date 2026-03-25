---
name: agent-wallet
description: Give an AI agent a scoped Ethereum wallet. Creates a Safe smart account owned by the user's browser wallet, then creates session keys on demand when the agent needs to transact.
---

# Agent Wallet

## When to activate

This skill has two phases:

**Phase 1 — Wallet creation** (user explicitly asks):
- "Give my agent a wallet"
- "Set up an agent wallet"
- "Create a wallet for on-chain access"

→ Bootstrap `.agent-wallet/`, connect the browser wallet, deploy the Safe. The user's EOA becomes the sole owner.

**Phase 2 — On-chain actions** (after wallet exists):

Request-to-intent mapping:

Permission (session creation only — does NOT execute):
- "allow", "grant", "permit", "give permission", "set limit", "create session key", "authorize" → create a session for the matching preset, then **STOP**
- Example: "Allow agent to swap up to 50 USDC" → creates `uniswap-swap` session with 50 USDC limit, stops

Execution (uses existing session — never creates one silently):
- "swap", "trade", "exchange", "buy WETH", "sell USDC" → `uniswap-swap`
- "send <TOKEN>", "transfer <TOKEN> to" → `transfer:<TOKEN>` (for example `transfer:USDC`)
- "supply", "deposit", "yield", "earn", "lend", "supply to aave" → `aave-supply`
- "withdraw", "withdraw from aave", "redeem", "remove from aave", "pull out" → `aave-withdraw`

Info: "check balance", "how much", "what's in my wallet" → balance check
Revoke: "revoke", "remove access", "disable session" → revocation

**Critical rule: Creating a session key grants an allowance — it does NOT trigger execution. The agent must never auto-execute after session creation. Execution requires a separate, explicit user intent or confirmation.**

Do NOT activate for questions about how wallets work or research — answer those from knowledge.

## How it works

```text
User's browser wallet (sole owner, signs via browser)
  └── Safe smart account (fresh per setup, unique salt)
        └── Session keys (scoped, time-limited, agent uses these)
```

- **Safe** = smart contract wallet on Base, owned by the user's browser wallet. A fresh Safe is created each time the skill runs (unique salt per setup).
- **Session key** = temporary key for the agent. Can only call specific contracts/functions for a limited time. Enforced on-chain by Rhinestone Smart Sessions (ERC-7579).
- **Browser wallet signs** deploy, session creation, revocation. The agent never has owner access.

The repo stays skill-first. Tracked helper files live in `references/scripts/` and are copied into a hidden `.agent-wallet/` workspace during bootstrap. The user never manages those files directly.

Data separation:
- `.agent-wallet/.wallet.json` — owner address + Safe address
- `.agent-wallet/.session.json` — session keys + permissions (one entry per preset)

## Phase 1: Wallet creation

When the user asks to give the agent a wallet, follow these steps. Run commands yourself — never tell the user to run them. Only pause when marked **PAUSE**.

1. If `.agent-wallet/node_modules/` does not exist → run BOOTSTRAP (section below)
2. Run: `cd .agent-wallet && pnpm run setup`
   **PAUSE**: user connects their browser wallet in the browser. This registers their EOA as sole owner.
3. Tell the user the Safe address. Ask them to send ~0.0001 ETH for deployment gas.
   **PAUSE**: wait for user to confirm they sent ETH.
4. Run: `cd .agent-wallet && pnpm run balance` to verify ETH arrived.
5. Run: `cd .agent-wallet && pnpm run deploy`
   - If output says "Safe already deployed" → skip straight to step 6
   - Otherwise → **PAUSE**: user signs in the browser wallet. Safe is now deployed with their EOA as sole owner.
6. Done. Tell the user: "Your agent has a wallet. When you ask me to do something on-chain, I'll request the permissions I need."

## Phase 2: On-chain actions

When the user asks to do something on-chain (and the wallet already exists), follow this flow. Run commands yourself — never tell the user to run them. Only pause when marked **PAUSE**.

```text
User request
     │
     ▼
Does .agent-wallet/.wallet.json exist?
  NO → "I don't have a wallet yet. Say 'give my agent a wallet' to set one up." Done.
  YES ↓

Classify intent:
  A) PERMISSION — "allow agent 50 USDC for swaps", "grant permission", "set limit"
  B) EXECUTE   — "swap 10 USDC for WETH", "send 5 USDC to 0x..."
  C) INFO      — "check balance"
  D) REVOKE    — "revoke access"
```

### A) PERMISSION intent (session creation — does NOT execute)

```text
Match request to preset
  NO MATCH → show available presets, ask what they want
  MATCH ↓

Ask duration if not specified (default: 24h)
Ask spending limit if not specified (required — no default)
PAUSE: show the user what they are granting before creating:
  - Preset name and description
  - Allowed contracts and functions
  - Spending limit (on-chain enforced via SpendingLimitsPolicy)
  - Duration and expiry time
Wait for user confirmation, then:
run: cd .agent-wallet && pnpm run create-session -- --preset <name> --duration <hours> --limit <amount>
PAUSE: user signs in the browser wallet to grant permission.
(This adds/replaces the entry for this preset in .session.json — other sessions are preserved.)

Report what was created. STOP. Do NOT execute anything.
Tell the user: "Session active. You can now ask me to [swap/supply/send] within this limit."
Done.
```

### B) EXECUTE intent (uses existing session)

```text
Match request to preset
  NO MATCH → show available presets, ask what they want
  MATCH ↓

.agent-wallet/.session.json has an entry for the matching preset AND expiresAt > now?
  NO → "I don't have permission to do that yet."
       Offer to create a session: "Want me to create a session key for [preset]?
       I'll need your browser wallet signature to grant [limit] [token] for [duration]."
       PAUSE: wait for user response.
         User says no → Done.
         User says yes → follow PERMISSION flow above.
                         After session creation → STOP.
                         Ask: "Session created. Ready to execute [the original request]. Shall I proceed?"
                         PAUSE: wait for explicit confirmation.
                           User says no → Done.
                           User says yes → continue below ↓
  YES ↓

Does the Safe have enough tokens? (run balance to check)
  NO → PAUSE: tell the user to send tokens to the Safe address, verify with balance
  YES ↓

Amount > 50 USDC?
  YES → PAUSE: confirm with the user before executing
  NO ↓

run: cd .agent-wallet && pnpm run execute -- --preset <name> --amount <N> [--to <address> for transfers]
Show transaction hash. Done.
```

### C) INFO intent

```text
run: cd .agent-wallet && pnpm run balance
Show results. Done.
```

### D) REVOKE intent

```text
run: cd .agent-wallet && pnpm run revoke [-- --preset <name> to revoke a specific session, or omit to revoke all]
PAUSE: user signs in the browser wallet.
Done.
```

**Session handling:**
- If `.session.json` exists but the preset does not match → create a new session (adds an entry for that preset; other sessions are preserved)
- If the session expired → create a new session and tell the user the old one expired
- To revoke: `cd .agent-wallet && pnpm run revoke`

## Bootstrap

When `.agent-wallet/` does not exist, create it automatically. Do all of this without asking — only pause for the bundler URL.

1. Create the hidden workspace and copy the tracked helper files:

```bash
mkdir -p .agent-wallet/src
cp references/scripts/package.json .agent-wallet/package.json
cp references/scripts/tsconfig.json .agent-wallet/tsconfig.json
cp references/scripts/.gitignore .agent-wallet/.gitignore
cp references/scripts/src/*.ts .agent-wallet/src/
```

2. Write `.agent-wallet/.env`:

```text
BUNDLER_URL=
CHAIN=base
```

3. Install dependencies:

```bash
cd .agent-wallet && pnpm install
```

4. **PAUSE**: Ask which bundler provider they want:

| Provider | Free tier | Sign up |
|----------|-----------|---------|
| **Pimlico** | Yes | https://dashboard.pimlico.io |
| **Alchemy** | Yes | https://dashboard.alchemy.com |
| **Coinbase** | Yes (Base) | https://portal.cdp.coinbase.com |

Wait for them to paste the URL. Write it to `.agent-wallet/.env` as `BUNDLER_URL=<url>`.

5. Continue with the decision flow (next step: setup).

## Tracked helper files

These files are the bootstrap source of truth for `.agent-wallet/`:

- `references/scripts/package.json`
- `references/scripts/tsconfig.json`
- `references/scripts/.gitignore`
- `references/scripts/src/config.ts`
- `references/scripts/src/account.ts`
- `references/scripts/src/presets.ts`
- `references/scripts/src/browser-signer.ts`
- `references/scripts/src/setup.ts`
- `references/scripts/src/deploy.ts`
- `references/scripts/src/create-session.ts`
- `references/scripts/src/execute.ts`
- `references/scripts/src/balance.ts`
- `references/scripts/src/revoke.ts`

Do not modify the copied `.agent-wallet/src` files manually unless the user explicitly asks. Update the tracked source files in `references/scripts/` instead.

## Safety rules

1. **Never ask the user for their private key.** The browser wallet signs everything.
2. **Always run balance before transacting.**
3. **Warn on amounts over 50 USDC.** Confirm before executing.
4. **Session keys expire on-chain** (TimeFramePolicy). Create a new one when expired.
5. **Never send funds to an unverified address.** The Safe address is shown during setup.
6. **The agent reads `.session.json` and the owner address from `.wallet.json`.** The owner address is public and needed by the SDK to reconstruct the account object. The agent has no owner signing capability.
7. **Real spending limits.** `--limit` sets an on-chain cumulative spending cap via Rhinestone's `SpendingLimitsPolicy` on the approve action. Always set a limit. Default recommendation: 100 USDC for first sessions.

## Presets reference

| Preset | What it does | Spend token | Chain |
|--------|-------------|-------------|-------|
| `uniswap-swap` | Swap USDC -> WETH on Uniswap V3 | USDC | Base |
| `aave-supply` | Supply USDC to Aave V3 for yield | USDC | Base |
| `aave-withdraw` | Withdraw USDC from Aave V3 | USDC | Base |
| `transfer:<TOKEN>` | Send a supported ERC-20 token | matching token | Base |
