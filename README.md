# Agent Wallet Skill

A skill-first repository that gives an AI agent a scoped Ethereum wallet. The runtime creates a ZeroDev Kernel smart account owned by the user's browser wallet, then grants scoped session keys so the agent can transact only through configured presets.

## Repo shape

- `SKILL.md` is the product. It contains activation rules and the wallet, grant, execution, status, and revoke flows.
- `references/` contains background material and troubleshooting notes.
- `references/scripts/` contains the tracked runtime templates copied into `.agent-wallet/` during bootstrap.

The repo is not a root-level app. The executable runtime lives in the hidden `.agent-wallet/` workspace created by the skill.

## Bootstrap model

When the user asks for an agent wallet, the skill:

1. creates `.agent-wallet/`
2. copies `references/scripts/` templates into it
3. writes `.agent-wallet/.env`
4. runs `pnpm install` inside `.agent-wallet/`
5. runs generated commands there:
   - `pnpm run setup`
   - `pnpm run deploy`
   - `pnpm run status`
   - `pnpm run grant`
   - `pnpm run execute`
   - `pnpm run balance`
   - `pnpm run revoke`

`pnpm run wallet -- <command>` is the single dispatcher. `pnpm run create-session` remains as a compatibility alias for `grant`.

## Limitations

### Local browser wallet required

The runtime opens a local signer page on `127.0.0.1:3000` so the user's browser wallet can sign owner operations. The agent and browser wallet must be on the same machine.

### Base presets only

The default DeFi presets use Base mainnet contract addresses. Setup can derive an account on Base Sepolia, but grant/execute for the bundled presets intentionally refuse chain mismatches until testnet preset addresses are added.

### Preset-based scope

The default flow ships with:

- `uniswap-swap`
- `aave-supply`
- `aave-withdraw`
- `transfer:<TOKEN>`

Session limits are enforced as per-transaction policy caps in the current ZeroDev permissions runtime, not cumulative lifetime spending caps.

For swaps, the permission policy also locks the route to Base USDC -> WETH through the Uniswap V3 0.05% pool, sends output to the smart account, and requires a nonzero minimum output. The script still requires a user-approved `--min-out` for each swap.

## Updating the skill

If runtime behavior changes, update `references/scripts/` and `SKILL.md` together. Do not treat `.agent-wallet/` as the maintained source of truth.
