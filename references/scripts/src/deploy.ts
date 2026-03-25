import { readFileSync } from "fs";
import { createPublicClient, http } from "viem";
import { createSmartAccountClient } from "permissionless";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { entryPoint07Address } from "viem/account-abstraction";
import { chain, rpcUrl, bundlerUrl, validateEnv } from "./config.js";
import { buildSignableSafeAccount } from "./account.js";

async function main() {
  validateEnv();
  const wallet = JSON.parse(readFileSync(".wallet.json", "utf-8"));

  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const code = await publicClient.getCode({ address: wallet.smartAccountAddress });
  if (code && code !== "0x") {
    console.log(`Safe already deployed at ${wallet.smartAccountAddress}`);
    return;
  }

  console.log(`Deploying Safe at ${wallet.smartAccountAddress}...`);
  console.log(`Owner: ${wallet.owner} (browser wallet - you will sign in the browser)\n`);

  const saltNonce = wallet.saltNonce ? BigInt(wallet.saltNonce) : undefined;
  const safeAccount = await buildSignableSafeAccount(wallet.owner, undefined, saltNonce);
  const pimlicoClient = createPimlicoClient({
    transport: http(bundlerUrl),
    entryPoint: { address: entryPoint07Address, version: "0.7" },
  });

  const client = createSmartAccountClient({
    account: safeAccount,
    chain,
    bundlerTransport: http(bundlerUrl),
    userOperation: {
      estimateFeesPerGas: async () => (await pimlicoClient.getUserOperationGasPrice()).fast,
    },
  });

  const hash = await client.sendTransaction({
    calls: [{ to: safeAccount.address, value: 0n, data: "0x" }],
  });

  console.log(`Deployed! tx: ${hash}`);
  console.log(`\nSafe owner: ${wallet.owner} (your browser wallet - sole owner)`);
  console.log(`Now run: pnpm run create-session`);
}

main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
