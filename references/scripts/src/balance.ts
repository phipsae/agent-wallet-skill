import { createPublicClient, http, formatUnits, type Address } from "viem";
import { chain, rpcUrl } from "./config.js";
import { fail, loadSessions, loadWallet } from "./state.js";
import { runMain } from "./run.js";

const ERC20_ABI = [{ inputs: [{ name: "account", type: "address" }], name: "balanceOf", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" }] as const;
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address;
const WETH = "0x4200000000000000000000000000000000000006" as Address;

export async function main() {
  const wallet = loadWallet({ optional: true });
  let address: Address | undefined = wallet?.smartAccountAddress;
  if (!address) {
    const sessions = loadSessions({ optional: true });
    const firstKey = Object.keys(sessions)[0];
    if (firstKey) address = sessions[firstKey].smartAccountAddress;
  }
  if (!address) fail("No address found. Run: pnpm run setup");

  const client = createPublicClient({ chain, transport: http(rpcUrl) });
  console.log(`Account: ${address}\n`);
  console.log(`ETH:  ${formatUnits(await client.getBalance({ address }), 18)}`);
  console.log(`USDC: ${formatUnits(await client.readContract({ address: USDC, abi: ERC20_ABI, functionName: "balanceOf", args: [address] }), 6)}`);
  console.log(`WETH: ${formatUnits(await client.readContract({ address: WETH, abi: ERC20_ABI, functionName: "balanceOf", args: [address] }), 18)}`);
}

runMain(import.meta.url, main);
