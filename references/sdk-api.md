# Runtime Template Reference

This repository does not ship a root-level SDK or CLI. The tracked runtime templates live in `references/scripts/` and are copied into `.agent-wallet/` during skill bootstrap.

## Tracked files

- `references/scripts/package.json`
- `references/scripts/tsconfig.json`
- `references/scripts/.gitignore`
- `references/scripts/src/config.ts`
- `references/scripts/src/account.ts`
- `references/scripts/src/presets.ts`
- `references/scripts/src/browser-signer.ts`
- `references/scripts/src/setup.ts`
- `references/scripts/src/deploy.ts`
- `references/scripts/src/create-session.ts`
- `references/scripts/src/execute.ts`
- `references/scripts/src/balance.ts`
- `references/scripts/src/revoke.ts`

## Resulting commands in `.agent-wallet/`

After bootstrap, the generated hidden workspace exposes:

- `pnpm run setup`
- `pnpm run deploy`
- `pnpm run create-session`
- `pnpm run execute`
- `pnpm run balance`
- `pnpm run revoke`

## Session creation

Single-session flow:

```bash
cd .agent-wallet && pnpm run create-session -- --preset uniswap-swap --duration 24 --limit 100
```

List presets:

```bash
cd .agent-wallet && pnpm run create-session -- --list
```

## Execution

Examples:

```bash
cd .agent-wallet && pnpm run execute -- --amount 10
cd .agent-wallet && pnpm run execute -- --amount 5 --to 0x...
```
