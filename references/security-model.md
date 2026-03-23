# Security Model

## Architecture

```
MetaMask EOA (sole owner)  ──  signs deploy, session creation, revocation via EIP-712
  │
  └── Safe smart account (deployed once, stable address)
        │
        └── Session keys (.session.json)  ──  agent's scoped access
              Can only call preset contracts/functions within time window.
              Enforced on-chain by SmartSessions + TimeFramePolicy.
```

No private keys with management power are stored on disk. MetaMask signs every owner operation (deploy, enable session, revoke session) via EIP-712 in the browser.

In `execute.ts`, the SDK account object is built with the session key as the local signer and `address` pinned to the deployed Safe. The session key can only sign session-scoped transactions — it has no owner privileges. On-chain ownership was fixed at deployment and cannot be changed by SDK calls.

## Key separation

| File | Who has it | Contains | Can do |
|------|-----------|----------|--------|
| `.wallet.json` | User + agent (read-only) | owner address, Safe address, chain ID | Nothing on its own — MetaMask signature required for all operations. Agent reads owner address to reconstruct the account object (SDK requirement). Owner address is public (on-chain). |
| `.session.json` | Agent | session key, permission ID, Safe address, preset, expiry | Call allowed contracts within time window |

The agent never sees the MetaMask private key. It reads the owner address from `.wallet.json` — this is public information (visible on-chain) needed by the SDK to build the Safe account object. All signing methods on the owner stub throw errors.

## Threat model

| Threat | What happens | Damage |
|--------|-------------|--------|
| Session key leaked | Attacker can call allowed contracts until expiry | Bounded by time + contract scope |
| `.wallet.json` leaked | Attacker learns the Safe address — but cannot sign (MetaMask required) | Information only |
| Owner EOA compromised | Full control of Safe | Total loss |
| Prompt injection tricks agent | Agent tries out-of-scope tx, on-chain rejects | None |
| Bundler compromised | Can censor txs, can't forge them | Liveness issue |

## On-chain enforcement

1. **TimeFramePolicy** — every session action has `validAfter` and `validUntil`. On-chain module rejects outside window.
2. **Contract + function allowlist** — each action specifies target address + selector. Anything else rejected on-chain.
3. **SpendingLimitsPolicy** — on `approve` actions, a cumulative spending limit is enforced on-chain (`--limit` flag). The approve caps how much the router/pool can pull via `transferFrom`. Once the cumulative approved amount hits the limit, the on-chain policy rejects further approvals. Policy contract: `0x000000000033212e272655d8a22402db819477a6`.
4. **Stable Safe address** — deploying once, sessions rotate without changing the address. No funds stranded.

## Recommendations

1. **Start small.** First session: 1 hour, 100 USDC limit.
2. **Use a dedicated MetaMask.** Don't use your main wallet as the Safe owner.
3. **Revoke when done.** `pnpm run revoke` disables the session on-chain (MetaMask signs via browser).
4. **Monitor.** Check balances regularly. Set alerts on the Safe address.
5. **Set tight limits.** The `--limit` flag is required. Start with 100 USDC and increase only if needed.
