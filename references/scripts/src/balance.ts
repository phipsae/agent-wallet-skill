import { readFileSync } from "fs";
import { createPublicClient, http, formatUnits, type Address } from "viem";
import { chain, rpcUrl } from "./config.js";

const ERC20_ABI = [{ inputs: [{ name: "account", type: "address" }], name: "balanceOf", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" }] as const;
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address;
const WETH = "0x4200000000000000000000000000000000000006" as Address;

async function main() {
  let address: Address | undefined;
  try { address = JSON.parse(readFileSync(".wallet.json", "utf-8")).smartAccountAddress; } catch {}
  if (!address) try {
    const sessionFile = JSON.parse(readFileSync(".session.json", "utf-8"));
    if (sessionFile.smartAccountAddress) {
      address = sessionFile.smartAccountAddress;
    } else {
      const firstKey = Object.keys(sessionFile)[0];
      if (firstKey) address = sessionFile[firstKey].smartAccountAddress;
    }
  } catch {}
  if (!address) { console.error("No address found. Run: pnpm run setup"); process.exit(1); }

  const client = createPublicClient({ chain, transport: http(rpcUrl) });
  console.log(`Account: ${address}\n`);
  console.log(`ETH:  ${formatUnits(await client.getBalance({ address }), 18)}`);
  console.log(`USDC: ${formatUnits(await client.readContract({ address: USDC, abi: ERC20_ABI, functionName: "balanceOf", args: [address] }), 6)}`);
  console.log(`WETH: ${formatUnits(await client.readContract({ address: WETH, abi: ERC20_ABI, functionName: "balanceOf", args: [address] }), 18)}`);
}

main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
