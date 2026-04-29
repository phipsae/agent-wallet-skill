# Security Model

## Architecture

```text
Browser wallet EOA (owner)
  -> ZeroDev Kernel smart account
      -> Session key in .agent-wallet/.session.json
```

The browser wallet signs setup, deployment, grants, and revocation through the local signer page on `127.0.0.1:3000`. The agent never receives owner authority.

## Local files

| File | Contains | Risk |
|------|----------|------|
| `.agent-wallet/.wallet.json` | owner address, smart account address, chain id | public metadata |
| `.agent-wallet/.session.json` | session private key, serialized permission data, preset, expiry | sensitive; bounded by configured policies |

The tracked helper files in `references/scripts/` are templates. Live runtime state is always inside `.agent-wallet/`.

## Enforcement

The current runtime uses ZeroDev permissions:

1. Timestamp policy expires each session.
2. Call policy restricts contract and function by preset.
3. Token actions use per-transaction amount caps.
4. Swap sessions lock Base USDC -> WETH route fields, the 0.05% fee tier, the smart-account recipient, amount in, nonzero minimum output, and zero price limit.
5. Transfer sessions lock the recipient at grant time.
6. Aave actions lock USDC and the smart account recipient.
7. Swap execution requires a caller-supplied minimum output; the script refuses dust-minimum swaps.

The token limit is not represented as a cumulative lifetime cap in this implementation. If total spend ceilings are required, add a policy that tracks cumulative usage or create short-lived single-use grants.

## Threat model

- Session key leaked: attacker can only use the allowed preset until expiry or revocation, subject to the policy limits.
- `.wallet.json` leaked: information only.
- `.session.json` leaked: sensitive; revoke active sessions immediately.
- Owner wallet compromised: total loss.
- Prompt injection against the agent: out-of-scope calls should fail through call policy or runtime checks, but users should still keep grants narrow and short-lived.
