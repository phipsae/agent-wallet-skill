# Off-Chain Exchange Compatibility

How the Safe + session key model maps to platforms that use off-chain order signing (Polymarket, Hyperliquid) rather than on-chain transactions (Uniswap, Aave).

## The Boundary

The session key model works when the agent submits **on-chain transactions from the Safe** (UserOps). It breaks when the platform requires **off-chain EIP-712 signatures** for trading.

```
Works (on-chain):     Safe ──session key──> UserOp ──> approve() + swap()
                      Policy enforcement: on-chain (SpendingLimitsPolicy)

Breaks (off-chain):   Signer ──> EIP-712 Order ──> REST API ──> platform settles
                      No UserOp. Session key has no role in signing.
```

| Platform | Trading mechanism | Fits Safe model? | Why |
|----------|------------------|-----------------|-----|
| Uniswap (Base) | On-chain tx (UserOp) | Yes | Session key calls contracts from Safe |
| Aave (Base) | On-chain tx (UserOp) | Yes | Same |
| Polymarket (Polygon) | Off-chain EIP-712 + REST API | Maybe | Has EIP-1271 support (POLY_1271) but untested with arbitrary Safes |
| Hyperliquid (own L1) | Off-chain EIP-712 + REST API | No | ecrecover only, no EIP-1271, funds must leave Safe |

---

## Polymarket

### How it works

Polymarket runs on **Polygon PoS** (chain 137). Trading is off-chain: users sign EIP-712 Order structs and POST them to `clob.polymarket.com`. Polymarket's operator matches orders off-chain and settles on-chain. Users never submit trade transactions.

On-chain interactions are limited to one-time token approvals (USDC.e + CTF tokens to exchange contracts) and optional on-chain order cancellation.

### Order structure (EIP-712)

```
Order {
  salt, maker, signer, taker,
  tokenId,        // CTF ERC-1155 outcome token
  makerAmount, takerAmount,
  expiration, nonce, feeRateBps,
  side,           // BUY or SELL
  signatureType,  // 0=EOA, 1=POLY_PROXY, 2=GNOSIS_SAFE, 3=POLY_1271
  signature
}
```

### Key contracts (Polygon)

| Contract | Address |
|----------|---------|
| USDC.e | `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174` |
| CTF (ERC-1155) | `0x4D97DCd97eC945f40cF65F87097ACe5EA0476045` |
| CTF Exchange | `0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E` |
| Neg Risk Exchange | `0xC5d563A36AE78145C45a50134d48A1215220f80a` |
| Neg Risk Adapter | `0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296` |

### Possible approaches

**A. ERC-7739 session key (ideal, unproven)**
Use Rhinestone's `erc7739Policies` to let the session key sign Polymarket Order typed data on behalf of the Safe. Polymarket verifies via `isValidSignature()` (signatureType 3, POLY_1271). Funds stay in Safe, on-chain policy enforcement. But: erc7739Policies may not be production-ready, and Polymarket's POLY_1271 support with arbitrary Safes is untested.

**B. Dedicated EOA (pragmatic, works today)**
Session key transfers USDC to a dedicated agent EOA. Agent uses that EOA directly with Polymarket's SDK (signatureType 0). Spending cap = transfer limit. But funds leave the Safe.

**C. Safe as Polymarket wallet (partially proven)**
Polymarket already uses 1-of-1 Gnosis Safes for browser users (signatureType 2). A `turnkey-safe-builder-example` repo exists for programmatic Safe-based trading. The Safe itself would be the Polymarket maker address. But: may require Polymarket's specific Safe deployment pattern, and the agent would need signing authority (violates "agent never owner" unless ERC-7739 works).

### Open questions

1. Does Rhinestone's SmartSessions implement `erc7739Policies` today?
2. Does Polymarket's POLY_1271 work with arbitrary Safes or only Polymarket-deployed ones?
3. Are Rhinestone module contracts deployed on Polygon?

---

## Hyperliquid

### How it works

Hyperliquid is its **own L1 blockchain** (HyperBFT consensus, ~0.2s finality). From Ethereum's perspective, all trading is off-chain. The only Ethereum touchpoint is the Bridge2 contract on Arbitrum for USDC deposits/withdrawals.

Trading: users sign EIP-712 structs ("phantom agent" mechanism) and POST to `api.hyperliquid.xyz/exchange`. HyperCore (a custom Rust VM, not EVM) matches and settles on the Hyperliquid L1.

**Hyperliquid does NOT support EIP-1271.** All signature verification uses `ecrecover` (ECDSA only). A Safe cannot be a Hyperliquid account. This is confirmed against official docs, SDK source code, and Arbiscan.

### Why it doesn't fit the Safe model

```
Safe (holds all funds)
  └─ session key ──> agent operates WITHIN the Safe
  └─ funds never leave
  └─ on-chain policy enforcement

vs.

Hyperliquid:
  Safe ──USDC must leave──> EOA ──must leave──> Hyperliquid L1
  - funds leave the Safe
  - session key has no reach on Hyperliquid
  - ecrecover only, no isValidSignature()
```

The Safe cannot be the master account. The master must be an EOA. Once funds are deposited to Hyperliquid, the session key has zero authority.

### Why you can't bridge directly from the Safe

It's tempting to cut out the EOA and bridge USDC straight from the Safe to Hyperliquid. The Safe *can* call Bridge2 on Arbitrum — that's just an on-chain transaction. But then `0xSafe...` becomes the Hyperliquid account, and you're stuck:

- To trade, approve an agent, or withdraw on Hyperliquid, you must sign an EIP-712 message verified by `ecrecover`.
- `ecrecover` returns a 20-byte address from an ECDSA signature. A Safe has no private key, so it can't produce one.
- On Ethereum, EIP-1271 solves this — the verifier calls `isValidSignature()` on the Safe contract. But Hyperliquid's L1 is not EVM. There is no Safe contract to call. Verification is purely `ecrecover(sig) == account address`.
- Result: funds deposited from the Safe land under an address that **nobody can sign for**. The USDC is locked on Hyperliquid with no way to trade or withdraw.

This is why the EOA must sit in the middle — it's the only account type that works on both sides of the bridge. The Safe's role is limited to controlling how much USDC reaches that EOA (funding valve).

### Native agent wallets (approveAgent)

Hyperliquid has protocol-level delegation built in:

```
Master EOA signs approveAgent(agentAddress, agentName)  // EIP-712, one-time
Agent EOA signs orders with its own key                  // trades on master's behalf
```

**Agent CAN:** place/cancel/modify orders, change leverage, TWAP orders.
**Agent CANNOT:** withdraw to Arbitrum, transfer USD/tokens, create agents/sub-accounts. Protocol-enforced.

Limits: 1 unnamed + 3 named agents per account, +2 per sub-account. Expiration via `valid_until` in agent name (server-enforced, not client-side).

### Spending limits via sub-accounts

No native spending limits exist. But sub-account capitalization + isolated margin achieves the same effect:

1. Create a sub-account
2. Transfer exactly X USDC to it
3. Approve agent for that sub-account only
4. Agent uses isolated margin

Max loss = sub-account balance. Agent cannot pull more funds from master (transfers are blocked for agents). Caveat: "use isolated margin" is behavioral, not protocol-enforced.

### Contracts

| Component | Chain | Address |
|-----------|-------|---------|
| Bridge2 | Arbitrum One | `0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7` |
| USDC | Arbitrum One | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` |

Note: Bridge2 is being deprecated in favor of native USDC via Circle CCTP (still operational as of March 2026).

### Best available approach

Session key as a **funding valve** only:

```
Safe (Arbitrum)
  │  session key: transfer max X USDC to Master EOA
  ▼
Master EOA (user's MetaMask)
  │  deposits to Hyperliquid, creates sub-account
  │  approveAgent(agentKey) for sub-account
  ▼
Agent trades within sub-account (isolated margin)
  Max loss = X USDC. Cannot withdraw.
```

The session key controls how much leaves the Safe. Hyperliquid's native agent system controls what happens after.

---

## The Two-Layer Model

For off-chain-signing platforms, the session key becomes a **funding valve**, not a trading policy:

```
Layer 1: Funding Control (Safe + session key)
  - Controls how much USDC leaves the Safe
  - On-chain enforcement via SpendingLimitsPolicy
  - Works identically for any destination

Layer 2: Trading Control (platform-specific)
  - Polymarket: ERC-7739 (ideal) or dedicated EOA (pragmatic)
  - Hyperliquid: native approveAgent (protocol-enforced, no withdrawals)
```

### Action presets vs funding presets

Current presets (uniswap-swap, aave-supply) are **action presets** -- they define exactly which on-chain calls the session key can make (approve + swap, approve + supply).

Off-chain exchange presets would be **funding presets** -- they only control how much money leaves the Safe. The actual trading is delegated to the platform's own system.

```
Action preset (Uniswap):              Funding preset (Hyperliquid):
  session key calls:                     session key calls:
    approve(router, X USDC)                transfer(masterEOA, X USDC)
    exactInputSingle(...)                  (that's it)
  policies:                              policies:
    SpendingLimitsPolicy(X USDC)           SpendingLimitsPolicy(X USDC)
    TimeFramePolicy(24h)                   TimeFramePolicy(24h)
    Contract allowlist (router only)       Recipient allowlist (EOA only)
    Selector allowlist (swap only)
```

---

## Implications for EF Recommendations

1. **The Safe + session key model is strongest for on-chain DeFi** (Uniswap, Aave, Compound, etc.). Full policy enforcement, funds never leave.

2. **Off-chain exchanges create a fundamental gap.** The session key can control funding but not trading. This is an inherent limitation, not a bug.

3. **EIP-1271 support is the deciding factor.** Platforms that support smart contract signatures (Polymarket's POLY_1271) may bridge the gap. Platforms that don't (Hyperliquid) cannot.

4. **Platform-native delegation (Hyperliquid's approveAgent) is the realistic model** for off-chain exchanges. The security properties differ (binary permissions, no spending limits) but the "agent can trade, cannot withdraw" boundary is meaningful.

5. **A complete agent wallet strategy needs both layers:** on-chain policy for DeFi, platform-native delegation for off-chain exchanges, with the Safe as the funding source for both.
