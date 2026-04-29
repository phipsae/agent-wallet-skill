# Policy Templates

The current runtime uses ZeroDev permissions with preset-based configuration. Keep the policy claims aligned with what the scripts actually build.

## Current capabilities

- **Contract allowlist**: the session can only call configured target contracts.
- **Function allowlist**: the session can only call configured functions.
- **Time window**: the session expires after `--duration` hours.
- **Per-transaction token cap**: approve and transfer actions cap the amount argument to `--limit`.
- **Approve spender lock**: approval presets restrict the spender argument to the protocol contract.
- **Uniswap route lock**: swap sessions restrict token in to USDC, token out to WETH, fee tier to 0.05%, recipient to the smart account, amount in to `--limit`, minimum output to greater than zero, and price limit to zero.
- **Transfer recipient lock**: transfer presets require `--to` at grant time and restrict the recipient argument to that address.
- **Aave account lock**: Aave supply/withdraw actions restrict the asset to USDC and the account recipient to the smart account.

## Current limitations

- The token cap is not cumulative across the session lifetime.
- Swap sessions still rely on the runtime and user to choose a fresh, economically acceptable `--min-out`; the policy only enforces that it is nonzero.
- Bundled presets are Base mainnet only.

## Recommended defaults

- Expiry: 1 to 24 hours.
- Limit: only what the agent needs for the next task.
- Transfer sessions: always lock one recipient.
- Swap sessions: require a fresh quote and a user-approved `--min-out` before execution.
