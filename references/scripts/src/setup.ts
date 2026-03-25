import { writeFileSync } from "fs";
import { requestBrowserSignature } from "./browser-signer.js";
import { chain, validateEnv } from "./config.js";
import { buildSafeAccount } from "./account.js";

async function main() {
  validateEnv();
  console.log(`Chain: ${chain.name} (${chain.id})\n`);

  const result = await requestBrowserSignature({
    title: "Connect Owner Wallet",
    description: "Connect your wallet to register it as the sole owner of your agent's Safe smart account. No transaction will be sent.",
    connectOnly: true,
    chainId: chain.id,
    chainName: chain.name,
  });

  const saltNonce = BigInt(Date.now());
  const safeAccount = await buildSafeAccount(result.signer, saltNonce);

  writeFileSync(".wallet.json", JSON.stringify({
    owner: result.signer,
    smartAccountAddress: safeAccount.address,
    saltNonce: saltNonce.toString(),
    chainId: chain.id,
  }, null, 2));

  console.log(`Owner:   ${result.signer}`);
  console.log(`Account: ${safeAccount.address}`);
  console.log("\nSaved to .wallet.json");
  console.log("\nNext: send ETH for gas to the account address, then run: pnpm run deploy");
}

main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
