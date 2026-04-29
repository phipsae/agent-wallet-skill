# Troubleshooting

## Bootstrap

### `.agent-wallet/` is missing files

Re-run the bootstrap steps from `SKILL.md`. The source templates live in `references/scripts/`.

### `BUNDLER_URL is required`

Set `BUNDLER_URL` in `.agent-wallet/.env`.

### `Unsupported CHAIN`

Use `CHAIN=base` or `CHAIN=base-sepolia`. Bundled DeFi presets currently grant and execute only on Base mainnet because their contract addresses are Base mainnet addresses.

## Setup and deploy

### `Account already deployed`

The deploy command detected bytecode at the smart account address. This is expected if it was already deployed.

### Deploy fails with insufficient funds

Send more ETH on Base to the smart account address and re-run:

```bash
cd .agent-wallet && pnpm run deploy
```

### Browser wallet did not open or timed out

Open the printed `http://127.0.0.1:3000?token=...` URL manually. The signer waits 5 minutes before timing out.

### Local signer port is already in use

Stop the process using port 3000, then rerun the command.

## Sessions

### `Unknown preset`

Run:

```bash
cd .agent-wallet && pnpm run grant -- --list
```

### `Smart account is not deployed yet`

Run:

```bash
cd .agent-wallet && pnpm run deploy
```

### `Session expired`

Create a new one:

```bash
cd .agent-wallet && pnpm run grant -- --preset <name> --duration 24 --limit <amount>
```

### `No .session.json`

No local session exists. Grant one before executing.

## Execution

### `--min-out is required`

Swap execution requires a user-approved minimum output. Quote the swap first, apply the user's slippage tolerance, then pass the resulting WETH minimum as `--min-out`.

### `This transfer session has no locked recipient`

Old transfer sessions did not store a recipient. Revoke and recreate the session with `--to <address>`.

### `Amount is over 50 USDC`

Pause for explicit user confirmation, then rerun with `--confirmed-high-value`.

### User operation reverts

Likely causes:

- session expired
- calldata does not match the preset policy
- insufficient token balance
- chain mismatch
- bundler or RPC rejected the user operation
- unsupported bundler fee estimation; the runtime tries Pimlico gas pricing first and falls back to public RPC fee estimates
