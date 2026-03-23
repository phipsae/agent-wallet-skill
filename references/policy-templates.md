# Policy Templates

> **Note:** These templates show a future `PolicyBuilder` API design. The current skill uses **preset-based configuration** with contract + function + time + spending limit constraints. Recipient locks would require custom Rhinestone policy contracts not included in this version.

## Current capabilities (what the skill actually enforces)

- **Contract allowlist** — agent can only call specific contract addresses
- **Function allowlist** — agent can only call specific function selectors
- **Time window** — session expires after `--duration` hours (on-chain `TimeFramePolicy`)
- **Cumulative spending limit** — `--limit` sets a cumulative cap on token approvals via `SpendingLimitsPolicy`. The approve is the gateway — the router/pool can only pull what's been approved, so capping approvals caps actual spending. Enforced on-chain at `0x000000000033212e272655d8a22402db819477a6`.
- **No recipient locks** — swap output or supply targets are not restricted by policy

## Token Swap (Uniswap V3) — future API

```typescript
import { PolicyBuilder } from "@eth-agent-wallet/core";
import { parseUnits } from "viem";

const policies = PolicyBuilder.swap({
  router: "0x2626664c2603336E57B271c5C0b26F421741e481", // Uniswap V3 Router (Base)
  tokenIn: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC
  maxAmount: parseUnits("100", 6),   // 100 USDC max
  recipient: wallet.address,          // output tokens go here (locked)
});
```

What it would allow:
- `approve(router, amount)` on USDC
- `exactInputSingle(...)` on Uniswap Router

What it would block:
- Swapping more than 100 USDC total
- Sending output tokens to any address other than the smart account
- Calling any other function on these contracts
- Calling any other contract

## ERC-20 Transfer — future API

```typescript
const policies = PolicyBuilder.transfer({
  token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC
  maxAmount: parseUnits("50", 6),    // 50 USDC max
  allowedRecipients: [               // optional — lock to these addresses
    "0xrecipient1...",
  ],
});
```

## Custom Policy — future API

```typescript
const policies = PolicyBuilder.custom()
  .allow("0xcontractAddress", "0xfunctionSelector")
  .withSpendingLimit(
    "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC
    parseUnits("200", 6),
  )
  .withRule({
    condition: "equal",
    calldataOffset: 0n,
    referenceValue: "0x...",
  })
  .allow("0xanotherContract", "approve")
  .build();
```

## Common function selectors

| Function | Selector | Used for |
|----------|----------|----------|
| `approve(address,uint256)` | `0x095ea7b3` | Token approvals |
| `transfer(address,uint256)` | `0xa9059cbb` | Token transfers |
| `exactInputSingle(...)` | `0x04e45aaf` | Uniswap V3 swaps (SwapRouter02, Base) |
| `supply(...)` | `0x617ba037` | Aave V3 supply |
| `balanceOf(address)` | `0x70a08231` | Read token balance |

## Recommended defaults for first-time setup

Start conservative:
- **Expiry:** 1 hour (raise later)
- **Contracts:** Only the ones the agent actually needs
- **Funding:** Only put in the Safe what you're comfortable with the agent spending
