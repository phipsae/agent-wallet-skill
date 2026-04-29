import { formatUnits } from "viem";
import { chain, bundlerUrl, rpcUrl } from "./config.js";
import { getPublicClient } from "./account.js";
import { ERC20_ABI, TOKENS } from "./presets.js";
import { loadSessions, loadWallet } from "./state.js";
import { runMain } from "./run.js";

export async function main() {
  console.log(`Chain:      ${chain.name} (${chain.id})`);
  console.log(`RPC URL:    ${rpcUrl}`);
  console.log(`Bundler:    ${bundlerUrl ? "configured" : "missing BUNDLER_URL"}`);

  const wallet = loadWallet({ optional: true });
  if (!wallet) {
    console.log("\nWallet:     not set up");
    return;
  }

  const publicClient = getPublicClient();
  const code = await publicClient.getCode({ address: wallet.smartAccountAddress });
  const deployed = !!code && code !== "0x";
  console.log(`\nOwner:      ${wallet.owner}`);
  console.log(`Account:    ${wallet.smartAccountAddress}`);
  console.log(`Deployed:   ${deployed ? "yes" : "no"}`);
  console.log(`ETH:        ${formatUnits(await publicClient.getBalance({ address: wallet.smartAccountAddress }), 18)}`);
  console.log(`USDC:       ${formatUnits(await publicClient.readContract({ address: TOKENS.USDC.address, abi: ERC20_ABI, functionName: "balanceOf", args: [wallet.smartAccountAddress] }), TOKENS.USDC.decimals)}`);
  console.log(`WETH:       ${formatUnits(await publicClient.readContract({ address: TOKENS.WETH.address, abi: ERC20_ABI, functionName: "balanceOf", args: [wallet.smartAccountAddress] }), TOKENS.WETH.decimals)}`);

  const sessions = loadSessions({ optional: true });
  const entries = Object.entries(sessions);
  if (entries.length === 0) {
    console.log("\nSessions:   none");
    return;
  }

  console.log("\nSessions:");
  const now = Math.floor(Date.now() / 1000);
  for (const [key, session] of entries) {
    const expired = session.expiresAt <= now;
    const recipient = session.recipient ? ` recipient=${session.recipient}` : "";
    console.log(`  ${key}: limit=${session.limit}, expires=${new Date(session.expiresAt * 1000).toLocaleString()}, ${expired ? "expired" : "active"}${recipient}`);
  }
}

runMain(import.meta.url, main);

