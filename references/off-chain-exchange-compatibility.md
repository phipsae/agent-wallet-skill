# Off-Chain Exchange Compatibility

The bundled wallet model is strongest for on-chain actions submitted from the smart account as user operations. It does not automatically fit venues where trading happens through off-chain order signatures and REST APIs.

## Boundary

```text
Works well:
Kernel smart account -> session key -> user operation -> on-chain protocol call

Does not directly fit:
EOA signature -> off-chain order -> exchange API -> platform settlement
```

For off-chain exchanges, the session key can often control funding into a venue, but it usually cannot enforce every later trade.

## Examples

| Platform | Trading mechanism | Fit |
|----------|-------------------|-----|
| Uniswap | On-chain transaction | Good fit |
| Aave | On-chain transaction | Good fit |
| Polymarket | Off-chain EIP-712 order plus API | Requires venue-specific signature support |
| Hyperliquid | Native off-chain order signing | Requires platform-native delegation |

## Practical model

Use two layers when a venue has its own signing system:

1. **Funding control**: smart account session key moves only a bounded amount to the venue or user-controlled account.
2. **Trading control**: the venue's native delegation, sub-account, or API permission system controls what the agent can do after funding.

This skill currently implements only the on-chain preset layer. Add venue-specific scripts only after confirming the venue's exact signing, withdrawal, and delegation model.
