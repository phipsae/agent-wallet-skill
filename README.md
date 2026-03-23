# Agent Wallet Skill

A Claude Code skill that gives an AI agent a scoped Ethereum wallet. It deploys a Safe smart account owned by the user's browser wallet (e.g., MetaMask, Rabby, Coinbase Wallet), then creates time-limited session keys so the agent can transact on-chain within strict boundaries enforced by Rhinestone Smart Sessions (ERC-7579).

## Limitations

### Local machine required

The skill runs a local HTTP server on `localhost:3000` (browser-signer) so the user's browser wallet can sign owner operations — deploying the Safe, creating session keys, and revoking access. This means:

- The agent and the user's browser **must be on the same machine**.
- Remote agents do not work. A Telegram bot running on a server, Claude in a web chat, or any setup where the user's browser is on a different device than the agent cannot sign transactions.
- The browser-signer has a **5-minute timeout**. If the user does not connect their wallet and sign within that window, the operation fails and must be retried.

### Base network only

All contract addresses and chain configuration are hardcoded to **Base** (chain ID 8453) and **Base Sepolia** (84532). This includes the Uniswap V3 Router, Aave V3 Pool, and all token addresses. The skill cannot deploy to or interact with Ethereum mainnet, Arbitrum, Optimism, or any other chain.

### ERC-20 tokens only — no native ETH

Swaps, transfers, and supply/withdraw all operate on ERC-20 tokens. Native ETH cannot be sent or swapped directly — Uniswap routes through WETH.

Four tokens are preconfigured: **USDC, WETH, DAI, cbETH**. The transfer preset accepts any ERC-20 token address, but swap and supply presets only work with the hardcoded set.

### Session duration is fixed and non-recurring

- Sessions expire after a set number of hours (default: **24 hours**). There is no infinite or auto-renewing option.
- Once a session expires, the agent cannot transact until the user creates a new session, which requires another wallet signature.
- The **spending limit is cumulative for the entire session**, not per-period. Setting a 50 USDC limit means 50 USDC total across all transactions until expiry — not 50 USDC per day.
- There is no built-in mechanism for recurring allowances (e.g., "50 USDC/day for 7 days with one signature"). This would require a custom Solidity policy contract that Rhinestone does not currently provide.

### Limited protocol support

The skill ships with **3 DeFi presets** plus dynamic token transfers:

| Preset | What it does | Constraint |
|--------|-------------|------------|
| `uniswap-swap` | Swap USDC for WETH | Unidirectional only (USDC to WETH), no arbitrary pairs |
| `aave-supply` | Supply USDC to Aave V3 | USDC only |
| `aave-withdraw` | Withdraw USDC from Aave V3 | USDC only |
| `transfer:<TOKEN>` | Send any ERC-20 token | Recipient not restricted by policy |

Other limitations:
- **No slippage protection** on swaps — `amountOutMinimum` is set to `1` and `sqrtPriceLimitX96` to `0`.
- **No recipient locks** — swap output goes to the smart account (hardcoded in the preset), but transfers can go to any address. A future PolicyBuilder API would support `allowedRecipients`, but this requires custom Rhinestone policy contracts not included in this version.

### Single owner, no multi-sig

The Safe is deployed with a **threshold of 1** — a single EOA as sole owner. There is no support for multi-sig or threshold wallets. Ownership is fixed at deployment and cannot be changed afterward via the skill.

### External bundler required

The skill does not include a bundler. An external ERC-4337 bundler service is required — Pimlico, Alchemy, or Coinbase. The user must provide a `BUNDLER_URL` in the `.env` file. If the bundler service is unavailable, no transactions can be submitted. Gas sponsorship (paymaster) is assumed to be available through the bundler.

### Session key stored unencrypted

The `.session.json` file contains the session private key in plaintext, protected only by OS file permissions (`chmod 600`, owner-read/write only). It is not encrypted at rest. Additionally, creating a new session overwrites the previous `.session.json` — only one session can be active at a time.

### Wallet displays raw calldata

When signing session creation, browser wallets show the raw hex-encoded `enableSessions` calldata rather than a human-readable summary. The skill's browser-signer decodes this into plain English (showing the preset, allowed contracts, spending limit, and duration), but the wallet's own UI does not. No wallet currently ships session key decoding. The long-term fix is ERC-7715 (`wallet_requestPermissions`), which is not yet implemented by any wallet as of March 2026.

### Pinned dependency versions

The skill pins exact versions of its core dependencies:

- `viem@2.47.6`
- `permissionless@0.3.4`
- `@rhinestone/module-sdk@0.4.0`

These libraries are under active development. Breaking changes in any of them could require code updates to the skill.
