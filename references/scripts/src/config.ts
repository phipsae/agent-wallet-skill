import { base, baseSepolia } from "viem/chains";
import type { Chain } from "viem";
import "dotenv/config";

const CHAIN_MAP: Record<string, Chain> = { base, "base-sepolia": baseSepolia };
const PUBLIC_RPC: Record<number, string> = { 8453: "https://mainnet.base.org", 84532: "https://sepolia.base.org" };

export const chain = CHAIN_MAP[process.env.CHAIN || "base"] || base;
export const rpcUrl = process.env.RPC_URL || PUBLIC_RPC[chain.id] || "https://mainnet.base.org";
export const bundlerUrl = process.env.BUNDLER_URL || "";

export function validateEnv() {
  if (!bundlerUrl) {
    console.error("BUNDLER_URL is required in .env\n");
    console.error("  Pimlico:  https://dashboard.pimlico.io");
    console.error("  Alchemy:  https://dashboard.alchemy.com");
    console.error("  Coinbase: https://portal.cdp.coinbase.com\n");
    process.exit(1);
  }
}
