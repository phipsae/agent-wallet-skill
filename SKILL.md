---
name: agent-wallet
description: Give an AI agent a scoped Ethereum wallet. Creates a Safe smart account owned by the user's MetaMask, then creates session keys on demand when the agent needs to transact.
---

# Agent Wallet

## When to activate

This skill has two phases:

**Phase 1 — Wallet creation** (user explicitly asks):
- "Give my agent a wallet"
- "Set up an agent wallet"
- "Create a wallet for on-chain access"

→ Bootstrap `.agent-wallet/`, connect MetaMask, deploy Safe. The user's EOA becomes the sole owner.

**Phase 2 — On-chain actions** (after wallet exists):

Request-to-intent mapping:

Permission (session creation only — does NOT execute):
- "allow", "grant", "permit", "give permission", "set limit", "create session key", "authorize" → create session for the matching preset, then **STOP**
- Example: "Allow agent to swap up to 50 USDC" → creates `uniswap-swap` session with 50 USDC limit, stops

Execution (uses existing session — never creates one silently):
- "swap", "trade", "exchange", "buy WETH", "sell USDC" → `uniswap-swap`
- "send <TOKEN>", "transfer <TOKEN> to" → `transfer:<TOKEN>` (e.g. `transfer:USDC`)
- "supply", "deposit", "yield", "earn", "lend", "supply to aave" → `aave-supply`
- "withdraw", "withdraw from aave", "redeem", "remove from aave", "pull out" → `aave-withdraw`

Info: "check balance", "how much", "what's in my wallet" → balance check
Revoke: "revoke", "remove access", "disable session" → revocation

**Critical rule: Creating a session key grants an allowance — it does NOT trigger execution. The agent must never auto-execute after session creation. Execution requires a separate, explicit user intent or confirmation.**

Do NOT activate for questions about how wallets work or research — answer those from knowledge.

## How it works

```
User's MetaMask (sole owner, signs via browser)
  └── Safe smart account (deployed once, stable address)
        └── Session keys (scoped, time-limited, agent uses these)
```

- **Safe** = smart contract wallet on Base, owned by MetaMask. Deployed once.
- **Session key** = temporary key for the agent. Can only call specific contracts/functions for a limited time. Enforced on-chain by Rhinestone Smart Sessions (ERC-7579).
- **MetaMask signs** deploy, session creation, revocation. The agent never has owner access.

All infrastructure lives in a hidden `.agent-wallet/` directory. The user never manages it.

Data separation:
- `.agent-wallet/.wallet.json` — owner address + Safe address (user-only)
- `.agent-wallet/.session.json` — session key + permissions (agent-accessible)

## Phase 1: Wallet creation

When the user asks to give the agent a wallet, follow these steps. Run commands yourself — never tell the user to run them. Only pause when marked **PAUSE**.

1. If `.agent-wallet/node_modules/` does not exist → run BOOTSTRAP (section below)
2. Run: `cd .agent-wallet && pnpm run setup`
   **PAUSE**: user connects MetaMask in browser. This registers their EOA as sole owner.
3. Tell user the Safe address. Ask them to send ~0.0001 ETH for deployment gas (Base is cheap).
   **PAUSE**: wait for user to confirm they sent ETH.
4. Run: `cd .agent-wallet && pnpm run balance` to verify ETH arrived.
5. Run: `cd .agent-wallet && pnpm run deploy`
   - If output says "Safe already deployed" → skip straight to step 6 (no MetaMask needed).
   - Otherwise → **PAUSE**: user signs in MetaMask. Safe is now deployed with their EOA as sole owner.
6. Done. Tell user: "Your agent has a wallet. When you ask me to do something on-chain, I'll request the permissions I need."

## Phase 2: On-chain actions

When the user asks to do something on-chain (and the wallet already exists), follow this flow. Run commands yourself — never tell the user to run them. Only pause when marked **PAUSE**.

```
User request
     │
     ▼
Does .agent-wallet/.wallet.json exist?
  NO → "I don't have a wallet yet. Say 'give my agent a wallet' to set one up." Done.
  YES ↓

Classify intent (see mapping above):
  A) PERMISSION — "allow agent 50 USDC for swaps", "grant permission", "set limit"
  B) EXECUTE   — "swap 10 USDC for WETH", "send 5 USDC to 0x..."
  C) INFO      — "check balance"
  D) REVOKE    — "revoke access"
```

### A) PERMISSION intent (session creation — does NOT execute)

```
Match request to preset
  NO MATCH → show available presets, ask what they want
  MATCH ↓

Ask duration if not specified (default: 24h)
Ask spending limit if not specified (required — no default)
PAUSE: show user what they are granting before creating:
  - Preset name and description
  - Allowed contracts and functions (from preset actions list)
  - Spending limit (on-chain enforced via SpendingLimitsPolicy)
  - Duration and expiry time
Wait for user confirmation, then:
run: cd .agent-wallet && pnpm run create-session -- --preset <name> --duration <hours> --limit <amount>
PAUSE: user signs in MetaMask to grant permission.

Report what was created. STOP. Do NOT execute anything.
Tell user: "Session active. You can now ask me to [swap/supply/send] within this limit."
Done.
```

### B) EXECUTE intent (uses existing session)

```
Match request to preset
  NO MATCH → show available presets, ask what they want
  MATCH ↓

.agent-wallet/.session.json exists with matching preset AND expiresAt > now?
  NO → "I don't have permission to do that yet."
       Offer to create a session: "Want me to create a session key for [preset]?
       I'll need your MetaMask signature to grant [limit] [token] for [duration]."
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
  NO → PAUSE: tell user to send tokens to the Safe address, verify with balance
  YES ↓

Amount > 50 USDC?
  YES → PAUSE: confirm with user before executing
  NO ↓

run: cd .agent-wallet && pnpm run execute -- --amount <N> [--to <address> for transfers]
Show transaction hash. Done.
```

### C) INFO intent

```
run: cd .agent-wallet && pnpm run balance
Show results. Done.
```

### D) REVOKE intent

```
run: cd .agent-wallet && pnpm run revoke
PAUSE: user signs in MetaMask.
Done.
```

**Session handling:**
- If `.session.json` exists but preset doesn't match → create new session (overwrites file, old session still valid on-chain until expiry)
- If session expired → create new session, tell user the old one expired
- To revoke: `cd .agent-wallet && pnpm run revoke` (MetaMask signs, removes on-chain)

## Bootstrap

When `.agent-wallet/` doesn't exist, create it automatically. Do all of this without asking — only pause for the bundler URL.

1. Create the directory and write config files:

```bash
mkdir -p .agent-wallet/src
```

Write `.agent-wallet/package.json`:
```json
{
  "name": "agent-wallet",
  "type": "module",
  "private": true,
  "scripts": {
    "setup": "tsx src/setup.ts",
    "deploy": "tsx src/deploy.ts",
    "create-session": "tsx src/create-session.ts",
    "execute": "tsx src/execute.ts",
    "balance": "tsx src/balance.ts",
    "revoke": "tsx src/revoke.ts"
  }
}
```

Write `.agent-wallet/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

Write `.agent-wallet/.gitignore`:
```
.env
.wallet.json
.session.json
node_modules/
dist/
```

Write `.agent-wallet/.env`:
```
BUNDLER_URL=
CHAIN=base
```

2. Write all source files to `.agent-wallet/src/` (see Source Files section below).

3. Install dependencies:

```bash
cd .agent-wallet && pnpm add viem@2.47.6 permissionless@0.3.4 @rhinestone/module-sdk@0.4.0 hono @hono/node-server dotenv && pnpm add -D typescript tsx @types/node
```

4. **PAUSE**: Ask which bundler provider they want:

| Provider | Free tier | Sign up |
|----------|-----------|---------|
| **Pimlico** | Yes | https://dashboard.pimlico.io |
| **Alchemy** | Yes | https://dashboard.alchemy.com |
| **Coinbase** | Yes (Base) | https://portal.cdp.coinbase.com |

Wait for them to paste the URL. Write it to `.agent-wallet/.env` as `BUNDLER_URL=<url>`.

5. Continue with the decision flow (next step: setup).

## Source files

These files are written to `.agent-wallet/src/` during bootstrap. Do not modify unless updating the skill itself.

### `src/config.ts`

```typescript
import { base, baseSepolia } from "viem/chains";
import type { Address, Chain } from "viem";
import "dotenv/config";

const CHAIN_MAP: Record<string, Chain> = { base, "base-sepolia": baseSepolia };
const PUBLIC_RPC: Record<number, string> = { 8453: "https://mainnet.base.org", 84532: "https://sepolia.base.org" };

export const chain = CHAIN_MAP[process.env.CHAIN || "base"] || base;
export const rpcUrl = process.env.RPC_URL || PUBLIC_RPC[chain.id] || "https://mainnet.base.org";
export const bundlerUrl = process.env.BUNDLER_URL || "";

export function validateEnv() {
  if (!bundlerUrl) {
    console.error("BUNDLER_URL is required in .env\n");
    console.error("  Pimlico:  https://dashboard.pimlico.io");
    console.error("  Alchemy:  https://dashboard.alchemy.com");
    console.error("  Coinbase: https://portal.cdp.coinbase.com\n");
    process.exit(1);
  }
}
```

### `src/account.ts`

Safe account builder and session encoding helpers.

```typescript
import {
  createPublicClient, http,
  type Address, type Hex,
} from "viem";
import { entryPoint07Address } from "viem/account-abstraction";
import { toSafeSmartAccount } from "permissionless/accounts";
import { toAccount } from "viem/accounts";
import {
  RHINESTONE_ATTESTER_ADDRESS,
  getOwnableValidator,
  getSmartSessionsValidator,
} from "@rhinestone/module-sdk";
import { chain, rpcUrl } from "./config.js";
import { requestBrowserSignature, type SessionMeta } from "./browser-signer.js";

export const SAFE_4337_MODULE = "0x7579EE8307284F293B1927136486880611F20002" as Address;
export const SAFE_LAUNCHPAD = "0x7579011aB74c46090561ea277Ba79D510c6C00ff" as Address;

// ── Safe account builders ───────────────────────────────────────────

/** Build Safe account for address computation only (no signing). */
export async function buildSafeAccount(owner: Address) {
  const safeOwner = toAccount({
    address: owner,
    async signMessage() { throw new Error("Use buildSignableSafeAccount for signing"); },
    async signTransaction() { throw new Error("Not needed"); },
    async signTypedData() { throw new Error("Use buildSignableSafeAccount for signing"); },
  });
  return _buildSafe(safeOwner, owner);
}

/**
 * Build Safe account with MetaMask browser signing.
 * signTypedData opens the browser for MetaMask to sign EIP-712 data.
 * Used by deploy, create-session, revoke — every owner operation goes through MetaMask.
 */
export async function buildSignableSafeAccount(owner: Address, sessionMeta?: SessionMeta) {
  const safeOwner = toAccount({
    address: owner,
    async signMessage() { throw new Error("Use signTypedData"); },
    async signTransaction() { throw new Error("Not needed"); },
    async signTypedData(typedData) {
      const result = await requestBrowserSignature({
        title: "Authorize Transaction",
        description: "Sign to authorize this Safe operation. Check the details in MetaMask.",
        typedData,
        chainId: chain.id,
        chainName: chain.name,
        sessionMeta,
      });
      return result.signature!;
    },
  });
  return _buildSafe(safeOwner, owner);
}

async function _buildSafe(safeOwner: any, owner: Address) {
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const ownableValidator = getOwnableValidator({ owners: [owner], threshold: 1 });
  const smartSessions = getSmartSessionsValidator({});

  return toSafeSmartAccount({
    client: publicClient,
    owners: [safeOwner],
    version: "1.4.1",
    entryPoint: { address: entryPoint07Address, version: "0.7" },
    safe4337ModuleAddress: SAFE_4337_MODULE,
    erc7579LaunchpadAddress: SAFE_LAUNCHPAD,
    attesters: [RHINESTONE_ATTESTER_ADDRESS],
    attestersThreshold: 1,
    validators: [
      { address: ownableValidator.address, context: ownableValidator.initData },
      { address: smartSessions.address, context: smartSessions.initData },
    ],
  });
}
```

### `src/presets.ts`

```typescript
import type { Address, Hex } from "viem";

export const ERC20_ABI = [
  { inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], name: "approve", outputs: [{ name: "", type: "bool" }], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], name: "transfer", outputs: [{ name: "", type: "bool" }], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "account", type: "address" }], name: "balanceOf", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
] as const;

export const UNISWAP_V3_ROUTER_ABI = [{
  inputs: [{ components: [
    { name: "tokenIn", type: "address" }, { name: "tokenOut", type: "address" },
    { name: "fee", type: "uint24" }, { name: "recipient", type: "address" },
    { name: "amountIn", type: "uint256" },
    { name: "amountOutMinimum", type: "uint256" }, { name: "sqrtPriceLimitX96", type: "uint160" },
  ], name: "params", type: "tuple" }],
  name: "exactInputSingle", outputs: [{ name: "amountOut", type: "uint256" }],
  stateMutability: "payable", type: "function",
}] as const;

export const AAVE_POOL_ABI = [
  { inputs: [{ name: "asset", type: "address" }, { name: "amount", type: "uint256" }, { name: "onBehalfOf", type: "address" }, { name: "referralCode", type: "uint16" }], name: "supply", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "asset", type: "address" }, { name: "amount", type: "uint256" }, { name: "to", type: "address" }], name: "withdraw", outputs: [{ name: "", type: "uint256" }], stateMutability: "nonpayable", type: "function" },
] as const;

const SEL = {
  APPROVE: "0x095ea7b3" as Hex,
  TRANSFER: "0xa9059cbb" as Hex,
  EXACT_INPUT_SINGLE: "0x04e45aaf" as Hex,
  SUPPLY: "0x617ba037" as Hex,
  WITHDRAW: "0x69328dec" as Hex,
};

export interface ExecuteParams { amount: bigint; smartAccount: Address; recipient?: Address; }
export interface ExecuteStep { label: string; to: Address; abi: readonly any[]; functionName: string; buildArgs: (p: ExecuteParams) => any[]; }
export interface ProtocolPreset {
  name: string; description: string; chainId: number;
  actions: Array<{ label: string; address: Address; selector: Hex }>;
  spendToken: { symbol: string; address: Address; decimals: number };
  execute: ExecuteStep[];
}

const TOKENS: Record<string, { symbol: string; address: Address; decimals: number }> = {
  USDC: { symbol: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address, decimals: 6 },
  WETH: { symbol: "WETH", address: "0x4200000000000000000000000000000000000006" as Address, decimals: 18 },
  DAI:  { symbol: "DAI",  address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb" as Address, decimals: 18 },
  cbETH: { symbol: "cbETH", address: "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22" as Address, decimals: 18 },
};

export function getToken(symbolOrAddress: string): typeof TOKENS[string] | undefined {
  const upper = symbolOrAddress.toUpperCase();
  if (TOKENS[upper]) return TOKENS[upper];
  return Object.values(TOKENS).find((t) => t.address.toLowerCase() === symbolOrAddress.toLowerCase());
}

const USDC = TOKENS.USDC.address;
const WETH = TOKENS.WETH.address;
const UNISWAP_ROUTER = "0x2626664c2603336E57B271c5C0b26F421741e481" as Address;
const AAVE_POOL = "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5" as Address;

export function buildTransferPreset(token: typeof TOKENS[string]): ProtocolPreset {
  return {
    name: `${token.symbol} Transfer`, description: `Transfer ${token.symbol} to an address (Base)`, chainId: 8453,
    actions: [
      { label: `transfer ${token.symbol}`, address: token.address, selector: SEL.TRANSFER },
    ],
    spendToken: token,
    execute: [
      { label: `Transfer ${token.symbol}`, to: token.address, abi: ERC20_ABI, functionName: "transfer", buildArgs: (p) => [p.recipient, p.amount] },
    ],
  };
}

export const PRESETS: Record<string, ProtocolPreset> = {
  "uniswap-swap": {
    name: "Uniswap V3 Swap", description: "Swap USDC → WETH on Uniswap V3 (Base)", chainId: 8453,
    actions: [
      { label: "exactInputSingle", address: UNISWAP_ROUTER, selector: SEL.EXACT_INPUT_SINGLE },
      { label: "approve USDC", address: USDC, selector: SEL.APPROVE },
    ],
    spendToken: TOKENS.USDC,
    execute: [
      { label: "Approve USDC", to: USDC, abi: ERC20_ABI, functionName: "approve", buildArgs: (p) => [UNISWAP_ROUTER, p.amount] },
      { label: "Swap USDC → WETH", to: UNISWAP_ROUTER, abi: UNISWAP_V3_ROUTER_ABI, functionName: "exactInputSingle",
        buildArgs: (p) => [{ tokenIn: USDC, tokenOut: WETH, fee: 500, recipient: p.smartAccount, amountIn: p.amount, amountOutMinimum: 1n, sqrtPriceLimitX96: 0n }] },
    ],
  },
  "aave-supply": {
    name: "Aave V3 Supply", description: "Supply USDC to Aave V3 for yield (Base)", chainId: 8453,
    actions: [
      { label: "supply", address: AAVE_POOL, selector: SEL.SUPPLY },
      { label: "approve USDC", address: USDC, selector: SEL.APPROVE },
    ],
    spendToken: TOKENS.USDC,
    execute: [
      { label: "Approve USDC", to: USDC, abi: ERC20_ABI, functionName: "approve", buildArgs: (p) => [AAVE_POOL, p.amount] },
      { label: "Supply to Aave", to: AAVE_POOL, abi: AAVE_POOL_ABI, functionName: "supply", buildArgs: (p) => [USDC, p.amount, p.smartAccount, 0] },
    ],
  },
  "aave-withdraw": {
    name: "Aave V3 Withdraw", description: "Withdraw USDC from Aave V3 (Base)", chainId: 8453,
    actions: [
      { label: "withdraw", address: AAVE_POOL, selector: SEL.WITHDRAW },
    ],
    spendToken: TOKENS.USDC,
    execute: [
      { label: "Withdraw from Aave", to: AAVE_POOL, abi: AAVE_POOL_ABI, functionName: "withdraw", buildArgs: (p) => [USDC, p.amount, p.smartAccount] },
    ],
  },
};

export function listPresets(): string {
  const lines = Object.entries(PRESETS).map(([key, p]) => `  ${key.padEnd(22)} ${p.description}`);
  lines.push(`  ${"transfer:<TOKEN>".padEnd(22)} Transfer any supported token (${Object.keys(TOKENS).join(", ")})`);
  return lines.join("\n");
}
```

### `src/browser-signer.ts`

Bridges CLI and browser wallet. Supports three modes: connect-only, send transaction, and sign typed data (EIP-712). MetaMask signs everything — no private key ever touches the terminal.

**Session calldata display:** When signing a session key creation (`enableSessions`), the page decodes the SafeOp calldata and shows a human-readable summary of what the session key will be able to do (tokens, functions, spending limits). MetaMask still shows raw hex — this is a known limitation until **ERC-7715** (`wallet_requestPermissions`) is adopted by wallets.

```typescript
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { exec } from "child_process";
import { randomBytes } from "crypto";
import type { Address, Hex } from "viem";

export interface SessionMeta {
  limitAmount: string;   // e.g. "1"
  limitToken: string;    // e.g. "USDC"
  durationHours: string; // e.g. "48"
  expiresAt: number;     // unix timestamp
}

export interface SignRequest {
  title: string;
  description: string;
  tx?: { to: Address; data: Hex; value?: string };
  typedData?: any;
  chainId: number;
  chainName: string;
  connectOnly?: boolean;
  sessionMeta?: SessionMeta;
}

export interface SignResult {
  signer: Address;
  txHash?: Hex;
  signature?: Hex;
}

export function requestBrowserSignature(request: SignRequest): Promise<SignResult> {
  return new Promise((resolve, reject) => {
    const nonce = randomBytes(16).toString("hex");
    const app = new Hono();
    app.get("/", (c) => {
      if (c.req.query("token") !== nonce) return c.text("Invalid token", 403);
      return c.html(signingPage(request, nonce));
    });
    app.post("/api/result", async (c) => {
      if (c.req.query("token") !== nonce) return c.json({ error: "Invalid token" }, 403);
      const body = await c.req.json<{ signer?: Address; txHash?: Hex; signature?: Hex; error?: string }>();
      if (body.error) reject(new Error(body.error));
      else {
        console.log(request.connectOnly ? "\n  Wallet connected." : "\n  Signed. Submitting to bundler...");
        resolve({ signer: body.signer!, txHash: body.txHash, signature: body.signature });
      }
      clearTimeout(timeout);
      setTimeout(() => { server.close(); }, 500);
      return c.json({ ok: true });
    });

    const url = `http://localhost:3000?token=${nonce}`;
    const server = serve({ fetch: app.fetch, port: 3000 }, () => {
      console.log(`\n  Open in your browser: ${url}`);
      console.log("  Waiting for wallet...\n");
      const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
      exec(`${cmd} ${url}`);
    });

    const timeout = setTimeout(() => { reject(new Error("Timed out (5 min)")); server.close(); }, 300000);
  });
}

function signingPage(req: SignRequest, nonce: string): string {
  const connectOnly = req.connectOnly ?? false;
  const hasTypedData = !!req.typedData;
  const txJson = req.tx ? JSON.stringify(req.tx) : "null";
  // Serialize typed data — convert BigInt to string for JSON
  const typedDataJson = hasTypedData
    ? JSON.stringify(req.typedData, (_, v) => typeof v === "bigint" ? "0x" + v.toString(16) : v)
    : "null";

  return `<!DOCTYPE html><html><head><title>${req.title}</title><meta charset="utf-8">
<style>body{font-family:system-ui;max-width:520px;margin:60px auto;padding:0 20px;line-height:1.5}
button{padding:14px 28px;font-size:16px;font-weight:600;cursor:pointer;border:none;border-radius:12px;width:100%}
#connect{background:#3b82f6;color:#fff}#sign{background:#10b981;color:#fff;display:none;margin-top:16px}
.status{margin:20px 0;padding:16px;border-radius:12px;text-align:center}
.error{background:#fee2e2;color:#991b1b}.success{background:#d1fae5;color:#065f46}.waiting{background:#fef3c7;color:#92400e}
#wallet-status{text-align:center;color:#666;margin-bottom:16px;font-size:14px}
#session-info{margin-bottom:24px;padding:16px 20px;border-radius:12px;font-size:14px;line-height:1.7;display:none}
#session-info.decoded{background:#f0fdf4;border:1px solid #86efac;color:#14532d}
#session-info.warning{background:#fefce8;border:1px solid #fde047;color:#713f12}
#session-info h3{margin:0 0 8px;font-size:15px}
#session-info ul{margin:4px 0 12px;padding-left:20px}
#session-info .note{font-size:13px;color:#6b7280;margin-top:8px;font-style:italic}</style></head><body>
<h2>${req.title}</h2><p style="color:#666;margin-bottom:32px">${req.description}</p>
<div id="session-info"></div>
<p id="wallet-status">No wallet connected</p><button id="connect">Connect Wallet</button>
<button id="sign">Sign</button><div id="result"></div>
<script type="module">
import{createWalletClient,custom}from'https://esm.sh/viem@2.23.0';
import{base,baseSepolia}from'https://esm.sh/viem@2.23.0/chains';
const TX=${txJson},TYPED_DATA=${typedDataJson},CONNECT_ONLY=${connectOnly},NONCE='${nonce}',CHAINS={8453:base,84532:baseSepolia},chain=CHAINS[${req.chainId}]||base;
const SESSION_META=${req.sessionMeta ? JSON.stringify(req.sessionMeta) : 'null'};
let wc,account;

// ── Session calldata decoder ──────────────────────────────────────
// Scans SafeOp callData for known addresses/selectors to show a
// human-readable summary. Long-term fix: ERC-7715 wallet_requestPermissions.
(function decodeSession(){
  if(!TYPED_DATA||!TYPED_DATA.message?.callData) return;
  const cd=TYPED_DATA.message.callData.toLowerCase().replace('0x','');
  if(!cd.includes('e9ae5c53')) return; // not enableSessions
  const el=document.getElementById('session-info');
  const ADDR={'833589fcd6edb6e08f4c7c32d4f71b54bda02913':'USDC',
    '4200000000000000000000000000000000000006':'WETH',
    '50c5725949a6f0c72e6c4a641f24049a917db0cb':'DAI',
    '2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22':'cbETH',
    '2626664c2603336e57b271c5c0b26f421741e481':'Uniswap V3 Router',
    'a238dd80c259a72e81d7e4664a9801593f98d1c5':'Aave V3 Pool'};
  const SEL={'a9059cbb':'transfer','095ea7b3':'approve',
    '04e45aaf':'swap (exactInputSingle)','617ba037':'supply'};
  const SPENDING_POLICY='000000000033212e272655d8a22402db819477a6';
  const tokens=[],protocols=[],funcs=[];
  for(const[a,n]of Object.entries(ADDR)){
    if(!cd.includes(a))continue;
    if(['USDC','WETH','DAI','cbETH'].includes(n))tokens.push(n);
    else protocols.push(n);
  }
  for(const[s,n]of Object.entries(SEL)){if(cd.includes(s))funcs.push(n);}
  const hasLimit=cd.includes(SPENDING_POLICY);
  if(!tokens.length&&!protocols.length&&!funcs.length){
    el.className='warning';el.style.display='block';
    el.innerHTML='<h3>⚠ Could not decode calldata</h3><p>Review the raw data in MetaMask carefully before signing.</p>';
    return;
  }
  let html='<h3>This session key will be able to:</h3><ul>';
  // Build action descriptions by combining tokens+funcs+protocols
  const seen=new Set();
  for(const f of funcs){
    if(f==='approve'&&tokens.length&&protocols.length){
      html+='<li>Approve '+tokens.join(', ')+' for '+protocols.join(', ')+'</li>';seen.add('approve');
    }else if(f==='transfer'&&tokens.length){
      html+='<li>Transfer '+tokens.join(', ')+'</li>';seen.add('transfer');
    }else if((f==='swap (exactInputSingle)'||f==='supply')&&protocols.length){
      html+='<li>'+f.charAt(0).toUpperCase()+f.slice(1)+' on '+protocols.join(', ')+'</li>';
    }else{html+='<li>'+f.charAt(0).toUpperCase()+f.slice(1)+'</li>';}
  }
  html+='</ul>';
  if(hasLimit){
    if(SESSION_META)html+='<p>✓ Spending limit: '+SESSION_META.limitAmount+' '+SESSION_META.limitToken+' (on-chain enforced)</p>';
    else html+='<p>✓ On-chain spending limit enforced</p>';
  }
  if(SESSION_META){
    const exp=new Date(SESSION_META.expiresAt*1000).toLocaleDateString(undefined,{month:'long',day:'numeric',year:'numeric'});
    html+='<p>✓ Duration: '+SESSION_META.durationHours+'h — expires '+exp+' (on-chain enforced)</p>';
  }else{
    html+='<p>✓ Time-limited session (on-chain enforced)</p>';
  }
  html+='<p class="note">MetaMask will show raw hex calldata — this is normal. The above is what you are actually approving.</p>';
  el.className='decoded';el.style.display='block';el.innerHTML=html;
})();

document.getElementById('connect').onclick=async()=>{if(!window.ethereum){document.getElementById('result').innerHTML='<div class="status error">No wallet found. Install MetaMask.</div>';return}
wc=createWalletClient({chain,transport:custom(window.ethereum)});[account]=await wc.requestAddresses();
document.getElementById('wallet-status').textContent='Connected: '+account.slice(0,6)+'...'+account.slice(-4);
document.getElementById('connect').style.display='none';
try{await wc.switchChain({id:chain.id})}catch{}
if(CONNECT_ONLY){document.getElementById('result').innerHTML='<div class="status success">Wallet connected! You can close this tab.</div>';
await fetch('/api/result?token='+NONCE,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({signer:account})});return}
document.getElementById('sign').style.display='block'};
document.getElementById('sign').onclick=async()=>{const btn=document.getElementById('sign');
try{btn.disabled=true;btn.textContent='Check your wallet...';
document.getElementById('result').innerHTML='<div class="status waiting">Waiting for wallet...</div>';
let result;
if(TYPED_DATA){
  const sig=await wc.signTypedData({account,...TYPED_DATA});
  result={signer:account,signature:sig};
}else if(TX){
  const hash=await wc.sendTransaction({account,to:TX.to,data:TX.data,value:TX.value?BigInt(TX.value):0n,chain});
  result={signer:account,txHash:hash};
}
document.getElementById('result').innerHTML='<div class="status success">Signed! You can close this tab.</div>';
await fetch('/api/result?token='+NONCE,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(result)});
btn.textContent='Done'}catch(e){document.getElementById('result').innerHTML='<div class="status error">'+e.message+'</div>';
btn.disabled=false;btn.textContent='Sign';
await fetch('/api/result?token='+NONCE,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({error:e.message})})}};
</script></body></html>`;
}
```

### `src/setup.ts`

Connects MetaMask and computes the stable Safe address. No keys generated — MetaMask is the sole owner.

```typescript
import { writeFileSync } from "fs";
import { requestBrowserSignature } from "./browser-signer.js";
import { chain, validateEnv } from "./config.js";
import { buildSafeAccount } from "./account.js";

async function main() {
  validateEnv();
  console.log(`Chain: ${chain.name} (${chain.id})\n`);

  const result = await requestBrowserSignature({
    title: "Connect Owner Wallet",
    description: "Connect your wallet to register it as the sole owner of your agent's Safe smart account. No transaction will be sent.",
    connectOnly: true,
    chainId: chain.id,
    chainName: chain.name,
  });

  // Compute stable Safe address (depends only on owner, not on sessions)
  const safeAccount = await buildSafeAccount(result.signer);

  writeFileSync(".wallet.json", JSON.stringify({
    owner: result.signer,
    smartAccountAddress: safeAccount.address,
    chainId: chain.id,
  }, null, 2));

  console.log(`Owner:   ${result.signer}`);
  console.log(`Account: ${safeAccount.address}`);
  console.log("\nSaved to .wallet.json");
  console.log("\nNext: send ETH for gas to the account address, then run: pnpm run deploy");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

### `src/deploy.ts`

Deploys the Safe. MetaMask signs the deployment UserOp via EIP-712 in the browser. Run once.

```typescript
import { readFileSync } from "fs";
import { createPublicClient, http } from "viem";
import { createSmartAccountClient } from "permissionless";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { entryPoint07Address } from "viem/account-abstraction";
import { chain, rpcUrl, bundlerUrl, validateEnv } from "./config.js";
import { buildSignableSafeAccount } from "./account.js";

async function main() {
  validateEnv();
  const w = JSON.parse(readFileSync(".wallet.json", "utf-8"));

  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const code = await publicClient.getCode({ address: w.smartAccountAddress });
  if (code && code !== "0x") {
    console.log(`Safe already deployed at ${w.smartAccountAddress}`);
    return;
  }

  console.log(`Deploying Safe at ${w.smartAccountAddress}...`);
  console.log(`Owner: ${w.owner} (MetaMask — you will sign in the browser)\n`);

  // Build Safe with browser-signing owner
  const safeAccount = await buildSignableSafeAccount(w.owner);

  const pimlicoClient = createPimlicoClient({
    transport: http(bundlerUrl),
    entryPoint: { address: entryPoint07Address, version: "0.7" },
  });

  const client = createSmartAccountClient({
    account: safeAccount,
    chain,
    bundlerTransport: http(bundlerUrl),
    userOperation: {
      estimateFeesPerGas: async () => (await pimlicoClient.getUserOperationGasPrice()).fast,
    },
  });

  // Deploy via a no-op call. MetaMask signs the EIP-712 SafeOp in the browser.
  const hash = await client.sendTransaction({
    calls: [{ to: safeAccount.address, value: 0n, data: "0x" }],
  });

  console.log(`Deployed! tx: ${hash}`);
  console.log(`\nSafe owner: ${w.owner} (your MetaMask — sole owner)`);
  console.log(`Now run: pnpm run create-session`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

### `src/create-session.ts`

Generates a session key and enables it on the deployed Safe. MetaMask signs the enableSessions UserOp via browser.

Usage: `pnpm run create-session -- --preset uniswap-swap --duration 24 --limit 100`

```typescript
import { readFileSync, writeFileSync, chmodSync } from "fs";
import { createPublicClient, http, parseUnits, toHex, toBytes, type Address, type Hex } from "viem";
import { entryPoint07Address } from "viem/account-abstraction";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createSmartAccountClient } from "permissionless";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import {
  OWNABLE_VALIDATOR_ADDRESS,
  getSpendingLimitsPolicy,
  getTimeFramePolicy,
  encodeValidationData,
  getPermissionId,
  getEnableSessionsAction,
  type Session,
} from "@rhinestone/module-sdk";
import { chain, rpcUrl, bundlerUrl, validateEnv } from "./config.js";
import { PRESETS, listPresets, buildTransferPreset, getToken } from "./presets.js";
import { buildSignableSafeAccount } from "./account.js";

const APPROVE_SELECTOR = "0x095ea7b3" as Hex;
const TRANSFER_SELECTOR = "0xa9059cbb" as Hex;

const args = process.argv.slice(2);
function getArg(name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : undefined;
}

async function main() {
  if (args.includes("--list")) { console.log("Available presets:\n"); console.log(listPresets()); process.exit(0); }
  validateEnv();

  const w = JSON.parse(readFileSync(".wallet.json", "utf-8"));
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const code = await publicClient.getCode({ address: w.smartAccountAddress });
  if (!code || code === "0x") { console.error("Safe not deployed. Run: pnpm run deploy"); process.exit(1); }

  const presetKey = getArg("preset");
  let preset;
  if (presetKey?.startsWith("transfer:")) {
    const tokenId = presetKey.split(":")[1];
    const token = getToken(tokenId);
    if (!token) { console.error(`Unknown token "${tokenId}". Run --list for supported tokens.`); process.exit(1); }
    preset = buildTransferPreset(token);
  } else if (presetKey && PRESETS[presetKey]) {
    preset = PRESETS[presetKey];
  } else {
    console.error(`Unknown preset. Available:\n${listPresets()}`); process.exit(1);
  }

  const limitStr = getArg("limit");
  if (!limitStr) { console.error("--limit is required (e.g. --limit 100 for 100 " + preset.spendToken.symbol + ")"); process.exit(1); }
  const limit = parseUnits(limitStr, preset.spendToken.decimals);

  const durationStr = getArg("duration") || "24";
  const duration = parseInt(durationStr) * 3600;
  const validAfter = Math.floor(Date.now() / 1000);
  const validUntil = validAfter + duration;

  // Generate session key for the agent
  const sessionPrivateKey = generatePrivateKey();
  const sessionSigner = privateKeyToAccount(sessionPrivateKey);

  const agentSession: Session = {
    sessionValidator: OWNABLE_VALIDATOR_ADDRESS,
    sessionValidatorInitData: encodeValidationData({ threshold: 1, owners: [sessionSigner.address] }),
    salt: toHex(toBytes(Date.now().toString(), { size: 32 })),
    userOpPolicies: [],
    erc7739Policies: { allowedERC7739Content: [], erc1271Policies: [] },
    actions: preset.actions.map((a) => ({
      actionTarget: a.address,
      actionTargetSelector: a.selector,
      actionPolicies: [
        getTimeFramePolicy({ validUntil, validAfter }),
        // On approve actions: enforce cumulative spending limit on-chain.
        // The approve caps how much the router/pool can pull via transferFrom.
        ...(a.selector === APPROVE_SELECTOR || a.selector === TRANSFER_SELECTOR
          ? [getSpendingLimitsPolicy([{ token: a.address, limit }])]
          : []),
      ],
    })),
    chainId: BigInt(preset.chainId),
    permitERC4337Paymaster: true,
  };

  const permissionId = getPermissionId({ session: agentSession });

  console.log("Enabling session on-chain...");
  console.log("MetaMask will open in your browser to sign.\n");

  // Build Safe with browser-signing owner — pass session metadata for browser UI
  const safeAccount = await buildSignableSafeAccount(w.owner, {
    limitAmount: limitStr,
    limitToken: preset.spendToken.symbol,
    durationHours: durationStr,
    expiresAt: validUntil,
  });

  const pimlicoClient = createPimlicoClient({
    transport: http(bundlerUrl),
    entryPoint: { address: entryPoint07Address, version: "0.7" },
  });

  const client = createSmartAccountClient({
    account: safeAccount,
    chain,
    bundlerTransport: http(bundlerUrl),
    userOperation: {
      estimateFeesPerGas: async () => (await pimlicoClient.getUserOperationGasPrice()).fast,
    },
  });

  // Enable session via UserOp — MetaMask signs in browser
  // Use SDK's getEnableSessionsAction (correct ABI encoding, not custom)
  const enableAction = getEnableSessionsAction({ sessions: [agentSession] });
  const hash = await client.sendTransaction({
    calls: [{ to: enableAction.to, value: 0n, data: enableAction.data }],
  });

  // Save session for agent (no owner, no admin — just session key)
  writeFileSync(".session.json", JSON.stringify({
    sessionPrivateKey,
    permissionId,
    smartAccountAddress: w.smartAccountAddress,
    chainId: preset.chainId,
    preset: presetKey,
    expiresAt: validUntil,
    limit: limitStr,
    session: JSON.parse(JSON.stringify(agentSession, (_, v) => typeof v === "bigint" ? v.toString() : v)),
  }, null, 2));
  chmodSync(".session.json", 0o600); // owner-only read/write

  console.log(`Enabled! tx: ${hash}`);
  console.log(`\nPreset:   ${preset.name}`);
  console.log(`Account:  ${w.smartAccountAddress}`);
  console.log(`Limit:    ${limitStr} ${preset.spendToken.symbol} (on-chain enforced)`);
  console.log(`Duration: ${durationStr}h`);
  console.log(`Expires:  ${new Date(validUntil * 1000).toLocaleString()}`);
  console.log(`\nThe agent can now run: pnpm run execute`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

### `src/execute.ts`

Agent transacts using session key. Reads `.session.json` + `.wallet.json` (for the owner address) — no owner signing, no browser needed.

```typescript
import { readFileSync } from "fs";
import { createPublicClient, http, parseUnits, encodeFunctionData, type Address, type Hex } from "viem";
import { privateKeyToAccount, toAccount } from "viem/accounts";
import { toSafeSmartAccount } from "permissionless/accounts";
import { createSmartAccountClient } from "permissionless";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { entryPoint07Address, getUserOperationHash } from "viem/account-abstraction";
import { getAccountNonce } from "permissionless/actions";
import {
  RHINESTONE_ATTESTER_ADDRESS,
  encodeSmartSessionSignature, SmartSessionMode, getOwnableValidatorMockSignature,
  getOwnableValidator, getSmartSessionsValidator, getAccount, encodeValidatorNonce,
  type Session,
} from "@rhinestone/module-sdk";
import { chain, rpcUrl, bundlerUrl, validateEnv } from "./config.js";
import { PRESETS, buildTransferPreset, getToken } from "./presets.js";
import { SAFE_4337_MODULE, SAFE_LAUNCHPAD } from "./account.js";

function loadSession(): any {
  let raw: any;
  try { raw = JSON.parse(readFileSync(".session.json", "utf-8")); }
  catch { console.error("No .session.json. Run: pnpm run create-session"); process.exit(1); }

  let wallet: any;
  try { wallet = JSON.parse(readFileSync(".wallet.json", "utf-8")); }
  catch { console.error("No .wallet.json. Run: pnpm run setup"); process.exit(1); }

  const session = JSON.parse(JSON.stringify(raw.session), (k, v) => {
    if (typeof v === "string" && /^\d+$/.test(v) && k === "chainId") return BigInt(v);
    return v;
  });
  return { ...raw, session, owner: wallet.owner };
}

async function buildAgentAccount(owner: Address, smartAccountAddress: Address) {
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });

  // Non-signing stub for the EOA owner. The SDK needs an owner to build the account
  // object, but signUserOperation is never called in the session key flow —
  // session signing happens directly via sessionOwner.signMessage below.
  const ownerStub = toAccount({
    address: owner,
    async signMessage() { throw new Error("Session key flow — owner signing not used"); },
    async signTransaction() { throw new Error("Not needed"); },
    async signTypedData() { throw new Error("Session key flow — owner signing not used"); },
  });

  const ownableValidator = getOwnableValidator({ owners: [owner], threshold: 1 });
  const smartSessions = getSmartSessionsValidator({});

  return toSafeSmartAccount({
    client: publicClient,
    owners: [ownerStub],
    address: smartAccountAddress,
    version: "1.4.1",
    entryPoint: { address: entryPoint07Address, version: "0.7" },
    safe4337ModuleAddress: SAFE_4337_MODULE,
    erc7579LaunchpadAddress: SAFE_LAUNCHPAD,
    attesters: [RHINESTONE_ATTESTER_ADDRESS],
    attestersThreshold: 1,
    validators: [
      { address: ownableValidator.address, context: ownableValidator.initData },
      { address: smartSessions.address, context: smartSessions.initData },
    ],
  });
}

async function sendSessionTx(sessionData: any, session: Session, calls: Array<{ to: Address; data: Hex }>): Promise<Hex> {
  const sessionOwner = privateKeyToAccount(sessionData.sessionPrivateKey);
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const pimlicoClient = createPimlicoClient({ transport: http(bundlerUrl), entryPoint: { address: entryPoint07Address, version: "0.7" } });
  const safeAccount = await buildAgentAccount(sessionData.owner, sessionData.smartAccountAddress);
  const client = createSmartAccountClient({
    account: safeAccount, chain, bundlerTransport: http(bundlerUrl),
    userOperation: { estimateFeesPerGas: async () => (await pimlicoClient.getUserOperationGasPrice()).fast },
  });

  const smartSessions = getSmartSessionsValidator({ sessions: [session] });
  const nonce = await getAccountNonce(publicClient, {
    address: safeAccount.address, entryPointAddress: entryPoint07Address,
    key: encodeValidatorNonce({ account: getAccount({ address: safeAccount.address, type: "safe" }), validator: smartSessions }),
  });

  const sessionDetails = {
    mode: SmartSessionMode.USE as const,
    permissionId: sessionData.permissionId as Hex,
    signature: getOwnableValidatorMockSignature({ threshold: 1 }),
  };

  const userOp = await client.prepareUserOperation({
    account: safeAccount, calls: calls.map((c) => ({ ...c, value: 0n })),
    nonce, signature: encodeSmartSessionSignature(sessionDetails),
  });

  const hash = getUserOperationHash({ chainId: chain.id, entryPointAddress: entryPoint07Address, entryPointVersion: "0.7", userOperation: userOp });
  const sig = await sessionOwner.signMessage({ message: { raw: hash } });
  userOp.signature = encodeSmartSessionSignature({ ...sessionDetails, signature: sig });

  const opHash = await client.sendUserOperation(userOp);
  const receipt = await pimlicoClient.waitForUserOperationReceipt({ hash: opHash });
  return receipt.receipt.transactionHash;
}

async function main() {
  validateEnv();
  const sd = loadSession();
  const session: Session = sd.session;

  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const code = await publicClient.getCode({ address: sd.smartAccountAddress });
  if (!code || code === "0x") { console.error("Safe not deployed. Run: pnpm run deploy"); process.exit(1); }
  if (sd.expiresAt && Date.now() / 1000 > sd.expiresAt) { console.error("Session expired. Run: pnpm run create-session"); process.exit(1); }

  let preset;
  if (sd.preset?.startsWith("transfer:")) {
    const token = getToken(sd.preset.split(":")[1]);
    if (!token) { console.error(`Unknown token in preset: ${sd.preset}`); process.exit(1); }
    preset = buildTransferPreset(token);
  } else {
    preset = PRESETS[sd.preset];
  }
  if (!preset) { console.error(`Unknown preset: ${sd.preset}`); process.exit(1); }

  let amountStr = "10";
  let recipient: Address | undefined;
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--amount" && args[i + 1]) amountStr = args[i + 1];
    if (args[i] === "--to" && args[i + 1]) recipient = args[i + 1] as Address;
  }
  const amount = parseUnits(amountStr, preset.spendToken.decimals);

  if (sd.preset?.startsWith("transfer:") && !recipient) {
    console.error("--to <address> is required for transfers"); process.exit(1);
  }

  console.log(`Account: ${sd.smartAccountAddress}`);
  console.log(`Preset:  ${preset.name}`);
  console.log(`Amount:  ${amountStr} ${preset.spendToken.symbol}`);
  if (recipient) console.log(`To:      ${recipient}`);
  console.log();

  for (let i = 0; i < preset.execute.length; i++) {
    const step = preset.execute[i];
    console.log(`${i + 1}. ${step.label}...`);
    const data = encodeFunctionData({ abi: step.abi, functionName: step.functionName, args: step.buildArgs({ amount, smartAccount: sd.smartAccountAddress, recipient }) });
    const txHash = await sendSessionTx(sd, session, [{ to: step.to, data }]);
    console.log(`   tx: ${txHash}`);
  }
  console.log(`\nDone.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

### `src/balance.ts`

```typescript
import { readFileSync } from "fs";
import { createPublicClient, http, formatUnits, type Address } from "viem";
import { chain, rpcUrl } from "./config.js";

const ERC20_ABI = [{ inputs: [{ name: "account", type: "address" }], name: "balanceOf", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" }] as const;
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address;
const WETH = "0x4200000000000000000000000000000000000006" as Address;

async function main() {
  let addr: Address | undefined;
  try { addr = JSON.parse(readFileSync(".wallet.json", "utf-8")).smartAccountAddress; } catch {}
  if (!addr) try { addr = JSON.parse(readFileSync(".session.json", "utf-8")).smartAccountAddress; } catch {}
  if (!addr) { console.error("No address found. Run: pnpm run setup"); process.exit(1); }

  const client = createPublicClient({ chain, transport: http(rpcUrl) });
  console.log(`Account: ${addr}\n`);
  console.log(`ETH:  ${formatUnits(await client.getBalance({ address: addr }), 18)}`);
  console.log(`USDC: ${formatUnits(await client.readContract({ address: USDC, abi: ERC20_ABI, functionName: "balanceOf", args: [addr] }), 6)}`);
  console.log(`WETH: ${formatUnits(await client.readContract({ address: WETH, abi: ERC20_ABI, functionName: "balanceOf", args: [addr] }), 18)}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

### `src/revoke.ts`

Disables a session on-chain. MetaMask signs via browser.

```typescript
import { readFileSync, unlinkSync } from "fs";
import { createPublicClient, http } from "viem";
import { entryPoint07Address } from "viem/account-abstraction";
import { createSmartAccountClient } from "permissionless";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { getRemoveSessionAction } from "@rhinestone/module-sdk";
import { chain, rpcUrl, bundlerUrl, validateEnv } from "./config.js";
import { buildSignableSafeAccount } from "./account.js";

async function main() {
  validateEnv();
  const w = JSON.parse(readFileSync(".wallet.json", "utf-8"));
  let s: any;
  try { s = JSON.parse(readFileSync(".session.json", "utf-8")); }
  catch { console.error("No .session.json. Nothing to revoke."); process.exit(1); }

  console.log(`Revoking session ${s.permissionId}...`);
  console.log("MetaMask will open in your browser to sign.\n");

  const safeAccount = await buildSignableSafeAccount(w.owner);
  const pimlicoClient = createPimlicoClient({ transport: http(bundlerUrl), entryPoint: { address: entryPoint07Address, version: "0.7" } });
  const client = createSmartAccountClient({
    account: safeAccount, chain, bundlerTransport: http(bundlerUrl),
    userOperation: { estimateFeesPerGas: async () => (await pimlicoClient.getUserOperationGasPrice()).fast },
  });

  const removeAction = getRemoveSessionAction({ permissionId: s.permissionId });
  const hash = await client.sendTransaction({
    calls: [{ to: removeAction.to, value: 0n, data: removeAction.data }],
  });

  unlinkSync(".session.json");
  console.log(`Revoked! tx: ${hash}`);
  console.log("Session disabled on-chain and deleted locally.");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

## Safety rules

1. **NEVER ask the user for their private key.** MetaMask signs everything via the browser.
2. **Always run balance before transacting.**
3. **Warn on amounts over 50 USDC.** Confirm before executing.
4. **Session keys expire on-chain** (TimeFramePolicy). Create a new one when expired.
5. **Never send funds to an unverified address.** The Safe address is shown during setup.
6. **The agent reads `.session.json` and the owner address from `.wallet.json`.** The owner address is public (on-chain) and needed by the SDK to reconstruct the account object. The agent has no owner signing capability — signing methods throw errors.
7. **Real spending limits.** `--limit` sets an on-chain cumulative spending cap via Rhinestone's `SpendingLimitsPolicy` on the approve action. The approve caps how much the router/pool can pull. The limit is enforced on-chain — the agent cannot exceed it even if compromised. Always set a limit. Default recommendation: 100 USDC for first sessions.

## Presets reference

| Preset | What it does | Spend token | Chain |
|--------|-------------|-------------|-------|
| `uniswap-swap` | Swap USDC → WETH on Uniswap V3 | USDC | Base |
| `aave-supply` | Supply USDC to Aave V3 for yield | USDC | Base |
