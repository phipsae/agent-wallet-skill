import { writeFileSync } from "fs";
import { requestBrowserSignature } from "./browser-signer.js";
import { chain, validateEnv } from "./config.js";
import { buildKernelAccount } from "./account.js";
import { runMain } from "./run.js";

export async function main() {
  validateEnv();
  console.log(`Chain: ${chain.name} (${chain.id})\n`);

  const result = await requestBrowserSignature({
    title: "Connect Owner Wallet",
    description: "Connect your wallet to register it as the sole owner of your agent's smart account. No transaction will be sent.",
    connectOnly: true,
    chainId: chain.id,
    chainName: chain.name,
  });

  const kernelAccount = await buildKernelAccount(result.signer);

  writeFileSync(".wallet.json", JSON.stringify({
    owner: result.signer,
    smartAccountAddress: kernelAccount.address,
    chainId: chain.id,
  }, null, 2));

  console.log(`Owner:   ${result.signer}`);
  console.log(`Account: ${kernelAccount.address}`);
  console.log("\nSaved to .wallet.json");
  console.log("\nNext: send ETH for gas to the account address, then run: pnpm run deploy");
}

runMain(import.meta.url, main);
