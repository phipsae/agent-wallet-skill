# Adding a Preset

A preset describes one scoped on-chain capability: which contract the session may call, what the call must look like, and how the runtime constructs it. New presets are added in `references/scripts/src/presets.ts`. Bootstrap copies that file into `.agent-wallet/` on the next workspace creation.

This guide walks through `aave-supply` as a copyable template. It fits the common shape: an ERC-20 spend token, an amount that lives at a calldata argument, no `msg.value`. Most new presets fit that shape.

## What a preset is made of

```ts
{
  name, description, chainId,    // human-readable + chain id
  actions: [...],                // what the session is ALLOWED to call
  spendToken: { ... },           // the ERC-20 the session spends
  execute: [...],                // how the runtime CONSTRUCTS each call
}
```

Two arrays do separate jobs:

- `actions` is consumed by `permission-plugin.ts` to build ZeroDev `toCallPolicy` permissions. It declares constraints (the spender must equal X, the amount must be at most `--limit`).
- `execute` is consumed by `execute.ts` at runtime. It declares concrete arguments (`buildArgs(params)` returns the array passed to `encodeFunctionData`).

You write each call twice, once per array. The two must agree. If they drift, session creation succeeds and the on-chain transaction fails with a confusing error.

## Walkthrough: `aave-supply`

The full preset, from `presets.ts`:

```ts
"aave-supply": {
  name: "Aave V3 Supply",
  description: "Supply USDC to Aave V3 for yield (Base)",
  chainId: 8453,
  actions: [
    {
      label: "supply USDC to Aave",
      address: AAVE_POOL,
      selector: SEL.SUPPLY,
      abi: AAVE_POOL_ABI,
      functionName: "supply",
      amountArgIndex: 1,
      fixedArgs: { 0: USDC, 3: 0n },
      grantArgs: { 2: "smartAccount" },
    },
    {
      label: "approve USDC for Aave",
      address: USDC,
      selector: SEL.APPROVE,
      abi: ERC20_ABI,
      functionName: "approve",
      amountArgIndex: 1,
      fixedArgs: { 0: AAVE_POOL },
    },
  ],
  spendToken: TOKENS.USDC,
  execute: [
    { label: "Approve USDC", to: USDC, abi: ERC20_ABI, functionName: "approve",
      buildArgs: (params) => [AAVE_POOL, params.amount] },
    { label: "Supply to Aave", to: AAVE_POOL, abi: AAVE_POOL_ABI, functionName: "supply",
      buildArgs: (params) => [USDC, params.amount, params.smartAccount, 0] },
  ],
},
```

### Top fields

- `name`, `description`: shown in `pnpm run grant -- --list` and in execute logs.
- `chainId`: `execute.ts` refuses to run if `CHAIN` does not match. Use `8453` for Base mainnet.

### `actions` entries

Each entry permits one selector on one target contract. `aave-supply` permits two: the supply call itself, and the prerequisite approval.

For each action:

- `label`: only used in error messages.
- `address`: the contract the session may call.
- `selector`: the 4-byte function selector. Add it to the `SEL` map in `presets.ts` if it is new.
- `abi` and `functionName`: used by `permission-plugin.ts` to decode arguments for ABI-aware policy mode.
- `amountArgIndex` (optional): the argument index whose value is capped at `--limit`. The runtime emits a `LESS_THAN_OR_EQUAL` constraint there.
- `fixedArgs` (optional): a map from argument index to a value the session is locked to. Use this for "the spender must be the protocol contract" or "the referral code must be 0".
- `grantArgs` (optional): a map from argument index to a source resolved at grant time:
  - `"smartAccount"`: the argument must equal the user's smart account address.
  - `"recipient"`: the argument must equal the address passed via `--to` (used by transfers).

In `aave-supply`'s supply action: arg 0 (`asset`) is locked to USDC, arg 1 (`amount`) is capped at the session limit, arg 2 (`onBehalfOf`) is locked to the smart account, arg 3 (`referralCode`) is locked to 0.

### `spendToken`

The ERC-20 the session is expected to draw from. Drives:

- `--limit` and `--amount` decimals parsing.
- The pre-execute balance check in `execute.ts` (skipped only for `aave-withdraw`).
- The 50 USDC high-value confirmation gate in `execute.ts`.

### `execute` entries

One per call the runtime should send, in order. Most presets approve first and call second.

- `label`: printed before each step at execute time.
- `to`, `abi`, `functionName`: must match the corresponding `actions` entry. If they drift, the session permits one shape and the runtime sends a different shape, and the bundler rejects the userop.
- `buildArgs(params)`: returns the args array. `params` carries `amount`, `smartAccount`, optional `recipient`, optional `minimumOut`. Anything else has to come from closures over module-scope constants.

## Adding a new preset, step by step

1. Pick a preset key. Keys live in `PRESETS` in `presets.ts`. Use kebab-case: `aave-supply`, `compound-supply`.
2. Add any new contract addresses or ABIs to the top of `presets.ts` next to `AAVE_POOL` and `AAVE_POOL_ABI`.
3. Add the function selector to `SEL` if it is new.
4. Copy the `aave-supply` block, rename, and edit:
   - Update `name`, `description`.
   - Update each `actions` entry: target address, selector, abi+functionName, the `amountArgIndex` / `fixedArgs` / `grantArgs` for that ABI.
   - Update `spendToken` if the input asset differs.
   - Update each `execute` entry to mirror the `actions` entries with concrete args.
5. List it: `cd .agent-wallet && pnpm run grant -- --list` should show the new key.
6. Grant a small test session: `pnpm run grant -- --preset <new-key> --limit 1 --duration 1`.
7. Execute against it: `pnpm run execute -- --preset <new-key> --amount 1`. The bundler error (or success) confirms the policy and execute path agree.

## Common shapes

| Need | Pattern |
|---|---|
| Cap a numeric arg at `--limit` | `amountArgIndex: <i>` |
| Lock an arg to a specific address or value | `fixedArgs: { <i>: <value> }` |
| Lock an arg to the user's smart account | `grantArgs: { <i>: "smartAccount" }` |
| Lock an arg to a `--to` recipient | `grantArgs: { <i>: "recipient" }` |
| Action that requires a prior `approve` | Two `actions` entries (approve + main) and two `execute` entries in order |

## What this guide does not cover

The current architecture handles the common shape well. It does not (yet) support:

- Functions that send `msg.value` (`execute.ts` hardcodes `value: 0n`).
- Native ETH as the spend token (`spendToken` requires an ERC-20 shape; the balance check uses `balanceOf`).
- Per-call `valueLimit` policies (`permission-plugin.ts` does not emit them).
- Constraining individual fields of a tuple argument via the ABI-aware path.

`uniswap-swap` solves the tuple case by dropping into a manual `policyRules` array with raw byte offsets. That is the escape hatch when the ABI-aware path cannot express a constraint. Read `uniswap-swap` in `presets.ts` and the `buildManualRules` function in `permission-plugin.ts` if you have to go there. Be careful: byte-offset rules bypass the ABI safety net.

If a desired preset needs `msg.value`, native-ETH spending, or any of the other gaps above, do not work around them inside a single preset. Those are core changes to `execute.ts`, `permission-plugin.ts`, and the `ProtocolPreset` type, and should be a deliberate skill update. The shape of that update is sketched in the next section.

## How to extend for native ETH (not yet implemented)

ZeroDev itself supports session keys with native-ETH authority: `toCallPolicy` accepts a per-permission `valueLimit`. The skill's runtime does not surface it today. If a future preset needs to send native ETH (a `transfer:ETH`, a `wrap-eth` calling `WETH.deposit()` with `msg.value`, or any other value-bearing call), the runtime needs three targeted changes.

### 1. Wire `value` through the execute path

In `references/scripts/src/execute.ts`, every call currently goes out with `value: 0n`:

```ts
const txHash = await kernelClient.sendTransaction({
  calls: [{ to: step.to, value: 0n, data }],
});
```

Add an optional `value` field to `ExecuteStep`. Accept either a fixed bigint or a cap descriptor (e.g. `{ cap: "limit" }` to cap at `params.amount`). Pass the resolved value into `sendTransaction`.

### 2. Emit `valueLimit` from the policy builder

In `permission-plugin.ts`, the `toCallPolicy` permissions object accepts a per-permission `valueLimit`. Today it is never set. Add a path that derives `valueLimit` from `--limit`, gated on the action declaring it (e.g. `valueCap: "limit"` on `ProtocolAction`). Without this, the session is not authorized to attach ETH even if the runtime tries.

### 3. Represent native ETH as a spend token

In `presets.ts`, `spendToken` is shaped for ERC-20 (`{ symbol, address, decimals }`). Add either a `native: true` flag or a sentinel like `{ symbol: "ETH", native: true, decimals: 18 }`. Then branch:

- `execute.ts` `ensureTokenBalance`: use `publicClient.getBalance(address)` for the native case instead of the ERC-20 `balanceOf`.
- `--limit` and `--amount` parsing: use 18 decimals for ETH.
- The 50-USDC high-value confirmation gate: either ignore native ETH or give it a separate threshold.

### Presets unlocked after the above

- `transfer:ETH`: cap value at `--limit`, lock recipient via `--to`. No calldata args; the policy is "value <= limit and target == recipient."
- `wrap-eth`: call `WETH.deposit()` with `msg.value` capped at `--limit`. No calldata args; the policy is the value cap plus the target lock on the WETH contract.

### Why this is not in the skill today

It is roughly 50 to 100 lines across `execute.ts`, `permission-plugin.ts`, and `presets.ts`, plus type updates. The cost is not large, but no current preset exercises it. Until a real preset needs native ETH, this infrastructure is unused surface area, and a refactor of security-sensitive code with no test coverage is risk you do not need to take. Do this work as part of adding the first preset that requires it, with a snapshot test on the policy bytes for that preset, and the change earns its keep in one go.

## Sanity checklist before granting on mainnet

- Every `actions` entry has a corresponding `execute` entry with matching `to`, `abi`, and `functionName`.
- Every numeric arg the user controls is either in `amountArgIndex` or in `fixedArgs`.
- Every address arg is either in `fixedArgs`, `grantArgs`, or the protocol simply does not allow it to be variable.
- The selector in `SEL` matches the first 4 bytes of `keccak256(<function signature>)`.
- The chain id is correct.
- `pnpm run grant -- --list` shows the preset.
- A small mainnet or testnet dry run with `--limit 1` rejects whatever the preset is supposed to reject.
