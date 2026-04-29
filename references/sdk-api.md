# Runtime Template Reference

The tracked runtime templates live in `references/scripts/` and are copied into `.agent-wallet/` during skill bootstrap.

## Commands

The generated workspace exposes a single dispatcher:

```bash
cd .agent-wallet && pnpm run wallet -- <command> [options]
```

Aliases are also available:

- `pnpm run setup`
- `pnpm run deploy`
- `pnpm run status`
- `pnpm run balance`
- `pnpm run grant`
- `pnpm run create-session` (alias for `grant`)
- `pnpm run execute`
- `pnpm run revoke`

## Grant

List presets:

```bash
cd .agent-wallet && pnpm run grant -- --list
```

Grant swap permission:

```bash
cd .agent-wallet && pnpm run grant -- --preset uniswap-swap --duration 24 --limit 100
```

Grant transfer permission with a locked recipient:

```bash
cd .agent-wallet && pnpm run grant -- --preset transfer:USDC --to 0x... --duration 24 --limit 25
```

`--limit` is a per-transaction token cap in the current ZeroDev permissions runtime.
For `uniswap-swap`, the policy also locks the route to Base USDC -> WETH through the 0.05% fee tier and the smart-account recipient.

## Execute

Swap execution requires a minimum WETH output:

```bash
cd .agent-wallet && pnpm run execute -- --preset uniswap-swap --amount 10 --min-out 0.002
```

Transfers use the recipient saved when the session was granted:

```bash
cd .agent-wallet && pnpm run execute -- --preset transfer:USDC --amount 5
```

For USDC amounts over 50, pass `--confirmed-high-value` only after explicit user confirmation.
