# Security Model

## Architecture

```text
Browser wallet EOA (sole owner)
  └── Safe smart account
        └── Session key in .agent-wallet/.session.json
```

The browser wallet signs deploy, session creation, and revocation through the local signer page on `localhost:3000`. The agent never receives owner authority.

## Local files

| File | Contains | Risk |
|------|----------|------|
| `.agent-wallet/.wallet.json` | owner address, Safe address, chain id | public metadata only |
| `.agent-wallet/.session.json` | session private key, permission id, preset, expiry | bounded by preset scope, time window, and spending limit |

The tracked helper files in `references/scripts/` are just templates. The live runtime state is always inside `.agent-wallet/`.

## Enforcement

1. **TimeFramePolicy** — each session expires on-chain.
2. **Contract + function allowlist** — only preset targets/selectors are allowed.
3. **SpendingLimitsPolicy** — on approve and transfer actions, a cumulative spending cap is enforced on-chain.
4. **Stable Safe address** — deploying once lets the user rotate sessions without changing the wallet address.

## Threat model

- Session key leaked → attacker can only use the allowed preset until expiry or revocation.
- `.wallet.json` leaked → information only.
- Owner wallet compromised → total loss.
- Prompt injection against the agent → out-of-scope actions should fail on-chain.
