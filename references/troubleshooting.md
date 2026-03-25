# Troubleshooting

## Bootstrap

### `.agent-wallet/` is missing files

Re-run the bootstrap steps from `SKILL.md`. The source templates live in `references/scripts/` and should be copied into `.agent-wallet/`.

### `BUNDLER_URL is required`

Set `BUNDLER_URL` in `.agent-wallet/.env`.

## Setup and deploy

### `Safe already deployed`

`deploy.ts` detected code at the Safe address. This is expected if the wallet was already deployed.

### Deploy fails with insufficient funds

Send more ETH to the Safe address on Base and re-run:

```bash
cd .agent-wallet && pnpm run deploy
```

### Browser wallet did not open or timed out

Open `http://localhost:3000` manually. The signer waits 5 minutes before timing out.

## Sessions

### `Unknown preset`

Run:

```bash
cd .agent-wallet && pnpm run create-session -- --list
```

### `Safe not deployed yet`

Run:

```bash
cd .agent-wallet && pnpm run deploy
```

### `Session expired`

Create a new one:

```bash
cd .agent-wallet && pnpm run create-session -- --preset <name> --duration 24 --limit <amount>
```

### `No .session.json`

No local session exists. Create one before executing.

## Execution

### `--to <address> is required for transfers`

Transfer presets need a recipient address at execution time.

### User operation reverts

Likely causes:

- session expired
- calldata does not match the preset
- insufficient token balance
- spending limit reached
