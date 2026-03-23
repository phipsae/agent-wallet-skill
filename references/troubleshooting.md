# Troubleshooting

## Setup & Deploy

### "BUNDLER_URL is required"
Set `BUNDLER_URL` in `.env`. Get one from Pimlico, Alchemy, or Coinbase.

### "Safe already deployed"
`deploy.ts` detected code at the Safe address. This is expected — you only deploy once.

### Deploy fails with "insufficient funds"
Send more ETH to the Safe address. First deployment costs ~0.0001 ETH on Base.

### MetaMask didn't open / timed out
The browser-signer starts a local server on port 3000. If the browser didn't open automatically, navigate to `http://localhost:3000` manually. The script times out after 5 minutes.

### Wrong MetaMask account connected
If you connect a different account than the one used in `setup.ts`, the signature will be invalid. Disconnect and reconnect with the correct account.

### "initData encoding bug: actionTarget is zero"
The round-trip verification caught a bug. Check that `SESSIONS_ABI` field order matches the on-chain contract: `(bytes4 actionTargetSelector, address actionTarget, PolicyData[])`.

## Session Management

### "Safe not deployed yet"
Run `pnpm run deploy` before creating sessions or executing.

### "Session expired"
The on-chain TimeFramePolicy has passed `validUntil`. Create a new session: `pnpm run create-session`.

### Create-session times out or produces no session file
Previously caused by `process.exit(0)` in `browser-signer.ts` firing 500ms after MetaMask signed — before the bundler call and file write could complete. Fixed by moving `process.exit(0)` to the calling script's `main()` chain (`.then(() => process.exit(0))`).

### Create-session fails
- Check the Safe is deployed (`pnpm run balance` shows the address)
- Check `.wallet.json` has `owner` and `smartAccountAddress`
- Check the bundler URL is valid
- MetaMask must be connected to the same account used in `setup.ts`

### "Unknown preset"
Run `pnpm run create-session -- --list` to see available presets.

### "--limit is required"
The `--limit` flag is mandatory. It sets a cumulative on-chain spending cap. Example: `pnpm run create-session -- --preset uniswap-swap --duration 24 --limit 100` (100 USDC max).

### Spending limit reached
The on-chain SpendingLimitsPolicy rejected the transaction because cumulative approved spending hit the limit. Create a new session with a higher limit if needed: `pnpm run create-session -- --preset <name> --limit <amount>`.

## Execution

### "Safe not deployed"
Run `pnpm run deploy` first. The agent cannot deploy the Safe.

### UserOp reverts on-chain
- Session expired (TimeFramePolicy)
- Contract/function not in session allowlist
- Calldata format mismatch
- Insufficient token balance

### "No .session.json"
Run `pnpm run create-session` to generate a session key.

## Revocation

### Revoke fails
- Check `.session.json` has the permission ID
- The Safe must be deployed
- MetaMask must sign the revocation in the browser

## Local Development

Start an Anvil fork:
```bash
anvil --fork-url https://mainnet.base.org --port 8545
```

Set in `.env`:
```
CHAIN=base
RPC_URL=http://127.0.0.1:8545
```

Fund with ETH:
```bash
cast send <SAFE_ADDRESS> --value 1ether --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 --rpc-url http://127.0.0.1:8545
```
