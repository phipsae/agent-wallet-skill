---
name: agent-wallet
description: Give an AI agent a scoped Ethereum wallet. Creates a ZeroDev Kernel smart account owned by the user's browser wallet, then grants scoped session keys only when the agent needs to transact.
---

# Agent Wallet

## When to activate

This skill has two phases:

**Phase 1 - Wallet creation** (user explicitly asks):
- "Give my agent a wallet"
- "Set up an agent wallet"
- "Create a wallet for on-chain access"

Bootstrap `.agent-wallet/`, connect the browser wallet, and deploy a ZeroDev Kernel smart account. The user's EOA is the owner key.

**Phase 2 - On-chain actions** (after wallet exists):

Permission intent (grant only, never execute):
- "allow", "grant", "permit", "give permission", "set limit", "create session key", "authorize" -> create a session for the matching preset, then stop.
- Example: "Allow agent to swap up to 50 USDC" -> grants `uniswap-swap` with a 50 USDC per-transaction cap, then stops.

Execution intent (uses an existing session, never creates one silently):
- "swap", "trade", "exchange", "buy WETH", "sell USDC" -> `uniswap-swap`
- "send <TOKEN>", "transfer <TOKEN> to" -> `transfer:<TOKEN>` (for example `transfer:USDC`)
- "supply", "deposit", "yield", "earn", "lend", "supply to aave" -> `aave-supply`
- "withdraw", "withdraw from aave", "redeem", "remove from aave", "pull out" -> `aave-withdraw`

Info: "check balance", "how much", "what's in my wallet" -> `status` or `balance`
Revoke: "revoke", "remove access", "disable session" -> revocation

Critical rule: creating a session key grants permission only. It must never trigger execution. Execution requires a separate explicit user intent or confirmation.

Do not activate for general wallet research questions; answer those from knowledge.

## How it works

```text
User's browser wallet (owner, signs via browser)
  -> ZeroDev Kernel smart account on Base
      -> Session keys in .agent-wallet/.session.json
```

- **Kernel smart account**: a smart account on Base owned by the user's browser wallet.
- **Session key**: a temporary agent-held key restricted by ZeroDev permission policies.
- **Browser wallet signs** setup, deploy, grant, and revoke operations. The agent never receives the owner private key.

Policy guarantees in this version:
- contract and function allowlist by preset
- session expiry via timestamp policy
- per-transaction token amount cap for configured token actions
- spender lock for approval actions
- Uniswap route lock for USDC -> WETH, 0.05% fee tier, smart-account recipient, nonzero minimum output, and zero price limit
- transfer recipient lock when `transfer:<TOKEN>` is granted with `--to`
- USDC/account locks for Aave actions

Do not describe `--limit` as a cumulative lifetime spending cap. It is a per-transaction policy cap in this runtime.

Runtime state:
- `.agent-wallet/.wallet.json` - owner address, smart account address, chain id
- `.agent-wallet/.session.json` - session private keys and scoped permission data, one entry per preset

## Phase 1: Wallet creation

When the user asks to give the agent a wallet, run commands yourself. Only pause where marked **PAUSE**.

1. If `.agent-wallet/node_modules/` does not exist, run Bootstrap below.
2. Run `cd .agent-wallet && pnpm run setup`.
   **PAUSE**: user connects their browser wallet in the browser.
3. Tell the user the smart account address. Ask them to send enough ETH on Base for deployment gas.
   **PAUSE**: wait for user confirmation.
4. Run `cd .agent-wallet && pnpm run balance` to verify ETH arrived.
5. Run `cd .agent-wallet && pnpm run deploy`.
   **PAUSE**: user signs in the browser wallet if deployment is needed.
6. Run `cd .agent-wallet && pnpm run status` and report the account address and deployed state.

## Phase 2: On-chain actions

Always run `cd .agent-wallet && pnpm run status` first if current wallet/session state is unclear.

### A) Permission intent

1. Match the request to a preset. If no match, run `cd .agent-wallet && pnpm run grant -- --list` and ask which preset they want.
2. Ask for duration if missing; default to 24h.
3. Ask for limit if missing; there is no default.
4. For `transfer:<TOKEN>`, require the recipient before grant.
5. Explain before signing:
   - preset and actions
   - allowed contracts/functions
   - per-transaction token cap
   - duration and expiry
   - recipient lock for transfer sessions
6. After explicit confirmation, run:

```bash
cd .agent-wallet && pnpm run grant -- --preset <name> --duration <hours> --limit <amount>
```

For transfers:

```bash
cd .agent-wallet && pnpm run grant -- --preset transfer:<TOKEN> --to <address> --duration <hours> --limit <amount>
```

**PAUSE**: user signs in the browser wallet to grant permission.

Report what was created and stop. Do not execute anything.

### B) Execution intent

1. Match the request to a preset.
2. If `.session.json` has no matching unexpired session, offer to create one via the Permission flow. After grant, stop and ask for a separate execution confirmation.
3. Run `cd .agent-wallet && pnpm run balance`.
4. If funds are insufficient, tell the user to fund the smart account and verify again.
5. For `uniswap-swap`, require a user-approved minimum WETH output and pass it as `--min-out`; never run swaps with a dust minimum.
6. For amounts over 50 USDC, pause for explicit confirmation and pass `--confirmed-high-value`.
7. Execute:

```bash
cd .agent-wallet && pnpm run execute -- --preset <name> --amount <N>
```

For swaps:

```bash
cd .agent-wallet && pnpm run execute -- --preset uniswap-swap --amount <USDC> --min-out <WETH>
```

For high-value USDC actions:

```bash
cd .agent-wallet && pnpm run execute -- --preset <name> --amount <N> --confirmed-high-value
```

Show transaction hashes when done.

### C) Info intent

```bash
cd .agent-wallet && pnpm run status
```

Use `pnpm run balance` for balances only.

### D) Revoke intent

```bash
cd .agent-wallet && pnpm run revoke
cd .agent-wallet && pnpm run revoke -- --preset <name>
```

**PAUSE**: user signs in the browser wallet.

## Bootstrap

When `.agent-wallet/` does not exist, create it automatically. Do not ask except for the bundler URL.

```bash
mkdir -p .agent-wallet/src
cp references/scripts/package.json .agent-wallet/package.json
cp references/scripts/tsconfig.json .agent-wallet/tsconfig.json
cp references/scripts/.gitignore .agent-wallet/.gitignore
cp references/scripts/src/*.ts .agent-wallet/src/
```

Write `.agent-wallet/.env`:

```text
BUNDLER_URL=
CHAIN=base
```

Run:

```bash
cd .agent-wallet && pnpm install
```

**PAUSE**: ask for a Base ERC-4337 bundler URL. Pimlico-compatible gas pricing is used when available, with public RPC fee estimation as a fallback. Suggested providers:

| Provider | Sign up |
|----------|---------|
| Pimlico | https://dashboard.pimlico.io |
| Alchemy | https://dashboard.alchemy.com |
| Coinbase | https://portal.cdp.coinbase.com |

Write the pasted URL to `.agent-wallet/.env` as `BUNDLER_URL=<url>`, then continue with setup.

## Runtime commands

The generated workspace exposes:
- `pnpm run wallet -- <command>` for the single dispatcher
- `pnpm run setup`
- `pnpm run deploy`
- `pnpm run status`
- `pnpm run balance`
- `pnpm run grant`
- `pnpm run create-session` (compatibility alias for `grant`)
- `pnpm run execute`
- `pnpm run revoke`

Update tracked files in `references/scripts/`, not copied files in `.agent-wallet/`.

## Safety rules

1. Never ask for a private key.
2. Never create a session and execute in the same step.
3. Always run balance or status before executing.
4. Always require `--min-out` for swaps.
5. Always lock transfer sessions to a recipient at grant time.
6. Confirm amounts over 50 USDC before execution.
7. Treat `.session.json` as sensitive; it contains session private keys.

## Presets

| Preset | What it does | Token | Chain |
|--------|--------------|-------|-------|
| `uniswap-swap` | Swap USDC -> WETH on Uniswap V3 | USDC | Base |
| `aave-supply` | Supply USDC to Aave V3 | USDC | Base |
| `aave-withdraw` | Withdraw USDC from Aave V3 | USDC | Base |
| `transfer:<TOKEN>` | Send a supported ERC-20 to a locked recipient | matching token | Base |
