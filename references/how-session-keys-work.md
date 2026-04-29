# How Session Keys Work

## Core idea

A session key is a temporary, limited-permission signing key for a smart account. The user keeps owner control in their browser wallet. The agent receives only a scoped key that can be revoked or allowed to expire.

## What lives where

```text
ON-CHAIN
ZeroDev Kernel smart account
  Owner validator: user's browser wallet
  Permission validator: session key plus policies

LOCAL
.agent-wallet/.wallet.json
  owner address
  smart account address
  chain id

.agent-wallet/.session.json
  session private key
  serialized permission data
  preset, limit, expiry, optional recipient
```

## Grant flow

1. The script generates a new session key.
2. It builds ZeroDev permission policies for the selected preset.
3. The user signs the grant with the browser wallet.
4. The serialized session data is stored in `.session.json`.
5. The script stops. Granting permission does not execute an action.

## Execution flow

1. The agent loads the matching unexpired session.
2. The script reconstructs the permission account and session signer.
3. It checks deployment, balance, amount, recipient, and swap minimum-output requirements.
4. It builds calldata from the preset.
5. It submits a user operation signed by the session key.

If the calldata falls outside the permission policy, the user operation should fail. For swaps, the policy locks the USDC -> WETH route, fee tier, recipient, amount-in cap, nonzero minimum output, and zero price limit; the runtime still requires the user-approved `--min-out` value for each execution.

## Revocation

The user runs `pnpm run revoke`. The browser wallet signs an owner operation that uninstalls the permission. The local session entry is then removed from `.session.json`.
