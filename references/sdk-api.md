# SDK API Reference

## Installation

```bash
pnpm add @eth-agent-wallet/core viem permissionless @rhinestone/module-sdk
```

## Core functions

### `createAgentWallet(config)` → `AgentWallet`

Deploys or connects to a Safe7579 smart account.

```typescript
import { createAgentWallet } from "@eth-agent-wallet/core";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const wallet = await createAgentWallet({
  owner: privateKeyToAccount("0x..."),  // owner's EOA
  chain: base,
  rpcUrl: "http://127.0.0.1:8545",     // or RPC provider
  bundlerUrl: "https://api.pimlico.io/v2/8453/rpc?apikey=...",
  paymasterUrl: "https://api.pimlico.io/v2/8453/rpc?apikey=...",
  // Optional:
  salt: 0n,                             // deterministic address
  existingAddress: "0x...",             // reconnect to existing account
});

// wallet.address — the smart account address
// wallet.client  — sends UserOps
```

### `createSession(config)` → `SessionData`

Creates a session key with scoped policies.

```typescript
import { createSession, PolicyBuilder } from "@eth-agent-wallet/core";
import { parseUnits } from "viem";

const sessionData = await createSession({
  wallet,  // from createAgentWallet()
  policies: PolicyBuilder.swap({
    router: "0x2626664c2603336E57B271c5C0b26F421741e481",  // Uniswap V3 on Base
    tokenIn: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC
    maxAmount: parseUnits("100", 6),                         // 100 USDC
    recipient: wallet.address,                               // locked to smart account
  }),
  expiresAt: Math.floor(Date.now() / 1000) + 86400,  // 24 hours — MANDATORY
});

// sessionData.sessionPrivateKey — give this to the agent
// sessionData.permissionId      — identifies this session on-chain
// sessionData.session           — full policy object
```

### `createAgentClient(config)` → `AgentClient`

Agent-side client. Takes the session data, signs and submits transactions within the session scope.

```typescript
import { createAgentClient } from "@eth-agent-wallet/core";

const agentClient = await createAgentClient({
  sessionData,  // from createSession()
  rpcUrl: "http://127.0.0.1:8545",
  bundlerUrl: "https://api.pimlico.io/v2/8453/rpc?apikey=...",
  paymasterUrl: "https://api.pimlico.io/v2/8453/rpc?apikey=...",
  chain: base,
});

// Send a transaction within session scope
const txHash = await agentClient.sendTransaction({
  to: "0x2626664c2603336E57B271c5C0b26F421741e481",
  data: "0x...",  // encoded calldata
});

// Check what the session allows
const caps = agentClient.getCapabilities();
// caps.targets — [{address, selector}, ...]
// caps.limits  — [{token, amount}, ...]
```

### `preflightCheck(tx, session)` → `PreflightResult`

Off-chain policy check. Called automatically by `agentClient.sendTransaction()`, but can also be called manually.

```typescript
import { preflightCheck } from "@eth-agent-wallet/core";

const result = preflightCheck(
  { to: "0x...", data: "0x...", value: 0n },
  sessionData.session,
);
// result.allowed — true/false
// result.reason  — why it was rejected (if applicable)
```

### `revokeSession(wallet, permissionId)` → `txHash`

Revokes a specific session. Requires the owner's wallet (not the session key).

```typescript
import { revokeSession } from "@eth-agent-wallet/core";

await revokeSession(wallet, sessionData.permissionId);
```

### `revokeAllSessions(wallet)` → `txHash`

Nuclear option — removes the Smart Sessions module entirely.

```typescript
import { revokeAllSessions } from "@eth-agent-wallet/core";

await revokeAllSessions(wallet);
```

## PolicyBuilder

### `PolicyBuilder.swap(config)`

Allows approve + exactInputSingle on Uniswap. Recipient locked to smart account.

### `PolicyBuilder.transfer(config)`

Allows ERC-20 transfer, optionally locked to specific recipients.

```typescript
PolicyBuilder.transfer({
  token: USDC,
  maxAmount: parseUnits("50", 6),
  allowedRecipients: ["0x..."],  // optional
});
```

### `PolicyBuilder.custom()`

Fluent builder for arbitrary policies.

```typescript
PolicyBuilder.custom()
  .allow("0xcontract", "0xselector")
  .withSpendingLimit(USDC, parseUnits("100", 6))
  .withRule({ condition: "equal", calldataOffset: 96n, referenceValue: "0x..." })
  .allow("0xother", "approve")
  .build();
```

## Contract addresses (Base)

| Contract | Address |
|----------|---------|
| Uniswap V3 Router | `0x2626664c2603336E57B271c5C0b26F421741e481` |
| Uniswap V3 Quoter | `0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a` |
| USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| WETH | `0x4200000000000000000000000000000000000006` |
