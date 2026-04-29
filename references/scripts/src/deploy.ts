import { createPublicClient, http } from "viem";
import { createKernelAccountClient } from "@zerodev/sdk";
import { chain, rpcUrl, bundlerUrl, validateEnv } from "./config.js";
import { buildSignableKernelAccount } from "./account.js";
import { createUserOperationFeeEstimator } from "./fees.js";
import { loadWallet } from "./state.js";
import { runMain } from "./run.js";

export async function main() {
  validateEnv();
  const wallet = loadWallet();

  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const code = await publicClient.getCode({ address: wallet.smartAccountAddress });
  if (code && code !== "0x") {
    console.log(`Account already deployed at ${wallet.smartAccountAddress}`);
    return;
  }

  console.log(`Deploying Kernel account at ${wallet.smartAccountAddress}...`);
  console.log(`Owner: ${wallet.owner} (browser wallet - you will sign in the browser)\n`);

  const kernelAccount = await buildSignableKernelAccount(wallet.owner);

  const client = createKernelAccountClient({
    account: kernelAccount,
    chain,
    bundlerTransport: http(bundlerUrl),
    userOperation: {
      estimateFeesPerGas: createUserOperationFeeEstimator(),
    },
  });

  // Send a no-op tx; Kernel deploys on the first UserOp.
  const hash = await client.sendTransaction({
    calls: [{ to: kernelAccount.address, value: 0n, data: "0x" }],
  });

  console.log(`Deployed! tx: ${hash}`);
  console.log(`\nOwner: ${wallet.owner} (your browser wallet - sole owner)`);
  console.log(`Now run: pnpm run grant`);
}

runMain(import.meta.url, main);
