import { base, baseSepolia } from "viem/chains";
import type { Chain } from "viem";
import "dotenv/config";

const CHAIN_MAP: Record<string, Chain> = { base, "base-sepolia": baseSepolia };
const PUBLIC_RPC: Record<number, string> = { 8453: "https://mainnet.base.org", 84532: "https://sepolia.base.org" };
const configuredChain = process.env.CHAIN || "base";

if (!CHAIN_MAP[configuredChain]) {
  console.error(`Unsupported CHAIN "${configuredChain}". Use one of: ${Object.keys(CHAIN_MAP).join(", ")}`);
  process.exit(1);
}

export const chainKey = configuredChain;
export const chain = CHAIN_MAP[configuredChain];
export const rpcUrl = process.env.RPC_URL || PUBLIC_RPC[chain.id] || "https://mainnet.base.org";
export const bundlerUrl = process.env.BUNDLER_URL || "";

export function validateEnv(options: { requireBundler?: boolean } = {}) {
  const requireBundler = options.requireBundler ?? true;
  if (requireBundler && !bundlerUrl) {
    console.error("BUNDLER_URL is required in .env\n");
    console.error("  Pimlico:  https://dashboard.pimlico.io");
    console.error("  Alchemy:  https://dashboard.alchemy.com");
    console.error("  Coinbase: https://portal.cdp.coinbase.com\n");
    process.exit(1);
  }
}
