# Repository Guidelines

## Project Structure & Module Organization

This is a skill-first repository, not a standalone root application. `SKILL.md` is the main product: it defines activation rules and wallet, session, execution, balance, and revoke flows. `README.md` describes the repository model and limitations.

Reference documentation lives in `references/*.md`. Runtime helper templates live in `references/scripts/`; the skill copies these into generated `.agent-wallet/` workspaces during bootstrap. Treat `references/scripts/src/` as the maintained source for executable behavior. Do not edit or commit `.agent-wallet/`, `node_modules/`, or `dist/`.

## Build, Test, and Development Commands

Run commands for helper scripts from `references/scripts/`:

```sh
cd references/scripts
pnpm install
pnpm exec tsc --noEmit
pnpm run wallet -- status
pnpm run setup
pnpm run deploy
pnpm run grant
pnpm run execute
pnpm run balance
pnpm run revoke
```

`pnpm install` installs template dependencies. `pnpm exec tsc --noEmit` type-checks strict TypeScript sources. The `pnpm run ...` commands execute the same flows used after templates are copied into `.agent-wallet/`; they require `.env` values such as `BUNDLER_URL` and should usually be tested on Base Sepolia first.

## Coding Style & Naming Conventions

Use TypeScript ESM with strict typing. Keep two-space indentation in JSON and TypeScript files. Prefer named exports, `camelCase` variables and functions, and descriptive kebab-case docs. Local TypeScript imports should keep the ESM `.js` extension pattern, for example `import { chain } from "./config.js"`.

Update `SKILL.md` and `references/scripts/` together when changing runtime behavior.

## Testing Guidelines

There is no committed test runner yet. For every change, run `pnpm exec tsc --noEmit` in `references/scripts/`. For behavior changes, smoke test the affected command on Base Sepolia when possible and record the result in the pull request. If adding tests, colocate them near the relevant helper and add a `pnpm test` script.

## Commit & Pull Request Guidelines

Recent history uses short conventional prefixes such as `docs:`, `refactor:`, and `skills:`. Follow that pattern with an imperative summary, for example `docs: clarify session key limits`.

Pull requests should describe the user-visible change, list modified skill/docs/script files, include type-check and smoke-test results, and call out wallet, chain, permission, or security implications. Link related issues when available.

## Security & Configuration Tips

Never commit `.env`, private keys, session files, generated wallet state, or `.agent-wallet/`. Keep Base and Base Sepolia assumptions explicit when editing addresses, policies, presets, or RPC behavior. Session grants only create permission; execution must remain a separate user intent.
