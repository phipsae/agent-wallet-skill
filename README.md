# Agent Wallet Skill

A skill-first repository that gives an AI agent a scoped Ethereum wallet. The skill creates a Safe smart account owned by the user's browser wallet, then creates time-limited session keys so the agent can transact on-chain within strict boundaries enforced by Rhinestone Smart Sessions (ERC-7579).

## Repo shape

- `SKILL.md` is the product. It contains the orchestration flow, intent mapping, and bootstrap instructions.
- `references/` contains background material and troubleshooting notes.
- `references/scripts/` contains the tracked helper files that the skill copies into `.agent-wallet/` during bootstrap.

This repo is not meant to be a standalone root-level application. The executable runtime lives in the hidden `.agent-wallet/` workspace created by the skill.

## Bootstrap model

When the user asks for an agent wallet, the skill:

1. creates `.agent-wallet/`
2. copies `references/scripts/` templates into it
3. writes `.agent-wallet/.env`
4. runs `pnpm install` inside `.agent-wallet/`
5. runs the generated commands there:
   - `pnpm run setup`
   - `pnpm run deploy`
   - `pnpm run create-session`
   - `pnpm run execute`
   - `pnpm run balance`
   - `pnpm run revoke`

## Limitations

### Local machine required

The skill runs a local HTTP server on `localhost:3000` so the user's browser wallet can sign owner operations — deploying the Safe, creating session keys, and revoking access. The agent and the browser wallet must be on the same machine.

### Base only

The tracked helper scripts are configured for Base and Base Sepolia only. Contract addresses and default assumptions are not multi-chain.

### One active local session file

`.agent-wallet/.session.json` stores a single active session key locally. Creating a new session overwrites the local file, although older sessions may still remain valid on-chain until expiry or revocation.

### Preset-based scope

The default flow ships with three DeFi presets plus dynamic ERC-20 transfers:

- `uniswap-swap`
- `aave-supply`
- `aave-withdraw`
- `transfer:<TOKEN>`

## Updating the skill

If you need to change runtime behavior, update the tracked templates in `references/scripts/` and the instructions in `SKILL.md` together. Do not treat `.agent-wallet/` as the maintained source of truth.
