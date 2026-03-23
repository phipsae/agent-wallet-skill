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

**A. ERC-7739 session key (ideal, blocked)**
Use Rhinestone's `erc7739Policies` to let the session key sign Polymarket Order typed data on behalf of the Safe. Polymarket verifies via `isValidSignature()` (signatureType 3, POLY_1271). Funds stay in Safe, on-chain policy enforcement. **Currently blocked** — see research findings below.

**B. Dedicated EOA (pragmatic, works today)**
Session key transfers USDC to a dedicated agent EOA. Agent uses that EOA directly with Polymarket's SDK (signatureType 0). Spending cap = transfer limit. But funds leave the Safe. **This is the only proven path today.**

**C. Safe as Polymarket wallet (partially proven)**
Polymarket already uses 1-of-1 Gnosis Safes for browser users (signatureType 2). A `turnkey-safe-builder-example` repo exists for programmatic Safe-based trading. The Safe itself would be the Polymarket maker address. But: signatureType 2 requires Polymarket's specific Safe factory (`getSafeAddress(signer)` derivation check). The agent would need signing authority (violates "agent never owner" unless ERC-7739 works).

### Research findings (March 2026)

#### 1. Does Rhinestone's SmartSessions implement `erc7739Policies` today?

**Code exists, but not production-ready.** The SmartSessions contract (v1.0.0, `0x00000000008bDABA73cD9815d79069c247Eb4bDA`) includes `SmartSessionERC7739` with full `isValidSignatureWithSender()` logic — checks permissionId, validates ERC-7739 content against an allow-list, enforces erc1271Policies, and validates the session key signature.

However:
- **Open bug** ([PR #177](https://github.com/erc7579/smartsessions/pull/177), since Oct 2025, unmerged): the ERC-1271 code path passes the full signature to both the policy and the validator, which breaks with standard validators like OwnableValidator. The fix separates `policyData` from `validatorSignature` but has not shipped.
- **Zero non-empty usage**: every SDK tutorial, demo, and example passes `{ allowedERC7739Content: [], erc1271Policies: [] }`. No tutorial or example demonstrates signing off-chain typed data through the ERC-7739 path.
- **Docs say "experimental"**: Rhinestone marks Smart Sessions as "experimental, expect breaking changes."
- **Only test**: a synthetic Foundry unit test (`SmartERC1271.t.sol`) with a dummy `Permit` struct.

**Verdict: hard blocker.** The architecture is sound but the implementation is buggy and unproven. Likely 6-12 months from production readiness.

#### 2. Does Polymarket's POLY_1271 work with arbitrary Safes?

**Yes, at the on-chain contract level — no whitelist, no factory check.** The `verifyPoly1271Signature` function in [Signatures.sol](https://github.com/Polymarket/ctf-exchange/blob/main/src/exchange/mixins/Signatures.sol) checks exactly three things:

```solidity
(signer == maker) && maker.code.length > 0
    && SignatureCheckerLib.isValidSignatureNow(maker, hash, signature)
```

No factory derivation, no registry. Compare with signatureType 2 (`POLY_GNOSIS_SAFE`), which calls `getSafeAddress(signer) == safeAddress` to verify the Safe was deployed through Polymarket's factory. Type 3 has no such restriction. The test (`ERC1271Signature.t.sol`) confirms this with a bare-bones mock contract — not a Polymarket-deployed Safe.

The same logic applies to the Neg Risk Exchange (`NegRiskCtfExchange` inherits `CTFExchange`).

**Client-side gap**: none of the official SDKs (TypeScript, Python, Rust) expose signatureType 3 in their enums — they stop at 2. The CLOB API server is closed-source, so it is unknown whether it accepts type 3 orders. Integration would require forking the SDK and testing against the API.

**Verdict: promising but untested end-to-end.** The on-chain path is open; the off-chain API path is unknown.

#### 3. Are Rhinestone module contracts deployed on Polygon?

**Yes, fully deployed.** Rhinestone's [supported chains page](https://docs.rhinestone.dev/home/resources/supported-chains) lists Polygon (chain 137). All contracts verified on Polygonscan via CREATE2 (same addresses as Base/mainnet):

| Contract | Address | On Polygon? |
|----------|---------|-------------|
| SmartSessions | `0x00000000008bDABA73cD9815d79069c247Eb4bDA` | Yes |
| SpendingLimitsPolicy | `0x000000000033212E272655D8a22402Db819477A6` | Yes |
| TimeFramePolicy | `0x0000000000D30f611fA3bf652ac6879428586930` | Yes |
| UniActionPolicy | `0x0000000000714Cf48FcF88A0bFBa70d313415032` | Yes |
| Module Registry | `0x000000000069E2a187AEFFb852bF3cCdC95151B2` | Yes (142 txns) |
| Safe7579 Adapter | `0x7579f2AD53b01c3D8779Fe17928e0D48885B0003` | Yes |
| Safe v1.4.1 (L2) | `0x29fcb43b46531bca003ddc8fcb67ffe91900c762` | Yes |
| EntryPoint v0.7 | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` | Yes (~8M txns) |
| Pimlico bundler | Operational on Polygon | Yes |

Near-zero usage on Polygon policy contracts though — ecosystem activity is concentrated on Base and Ethereum mainnet.

**Verdict: not a blocker.** Infrastructure is in place.

### Summary

| Question | Answer | Blocker? |
|----------|--------|----------|
| erc7739Policies works? | No — buggy, unmerged fix, zero production use | **Hard blocker** |
| POLY_1271 accepts any Safe? | Yes on-chain, unknown at CLOB API | Needs testing |
| Rhinestone on Polygon? | Fully deployed | Not a blocker |

The single hard blocker is Rhinestone's `erc7739Policies`. Until that bug is fixed and shipped, a session key cannot sign Polymarket orders on behalf of the Safe. The dedicated EOA approach (Option B) remains the only proven path.

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
