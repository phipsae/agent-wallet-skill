import { readFileSync, writeFileSync, chmodSync, unlinkSync } from "fs";
import { createSmartAccountClient } from "permissionless";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { http, encodeFunctionData, zeroAddress, zeroHash, maxUint256, type Hex } from "viem";
import { entryPoint07Address } from "viem/account-abstraction";
import { SMART_SESSION_EMISSARY_ADDRESS } from "@rhinestone/sdk";
import { chain, bundlerUrl, validateEnv } from "./config.js";
import { buildSignableSafeAccount } from "./account.js";

// SmartSessionEmissary removeConfig ABI (partial — only what we need)
const removeConfigAbi = [{
  type: "function", name: "removeConfig",
  inputs: [
    { name: "account", type: "address" },
    { name: "config", type: "tuple", components: [
      { name: "scope", type: "uint8" },
      { name: "resetPeriod", type: "uint8" },
      { name: "allocator", type: "address" },
      { name: "permissionId", type: "bytes32" },
    ]},
    { name: "disableData", type: "tuple", components: [
      { name: "allocatorSig", type: "bytes" },
      { name: "userSig", type: "bytes" },
      { name: "expires", type: "uint256" },
    ]},
  ],
  outputs: [],
  stateMutability: "nonpayable",
}] as const;

const SCOPE_MULTICHAIN = 0;
const RESET_PERIOD_ONE_WEEK = 6;

async function main() {
  validateEnv();
  const wallet = JSON.parse(readFileSync(".wallet.json", "utf-8"));
  let file: any;
  try { file = JSON.parse(readFileSync(".session.json", "utf-8")); }
  catch { console.error("No .session.json. Nothing to revoke."); process.exit(1); }

  const args = process.argv.slice(2);
  const presetIndex = args.indexOf("--preset");
  const presetKey = presetIndex !== -1 && args[presetIndex + 1] ? args[presetIndex + 1] : undefined;

  // Normalize old single-session format to map
  let sessions: Record<string, any>;
  if (file.sessionPrivateKey) {
    sessions = { [file.preset]: file };
  } else {
    sessions = file;
  }

  // Determine which sessions to revoke
  const toRevoke: Array<{ key: string; permissionId: string }> = [];
  if (presetKey) {
    if (!sessions[presetKey]) { console.error(`No session for preset "${presetKey}".`); process.exit(1); }
    toRevoke.push({ key: presetKey, permissionId: sessions[presetKey].permissionId });
  } else {
    for (const [key, session] of Object.entries(sessions)) {
      toRevoke.push({ key, permissionId: (session as any).permissionId });
    }
  }

  console.log(`Revoking ${toRevoke.length} session(s)...`);
  console.log("Your browser wallet will open to sign.\n");

  const saltNonce = wallet.saltNonce ? BigInt(wallet.saltNonce) : undefined;
  const safeAccount = await buildSignableSafeAccount(wallet.owner, undefined, saltNonce);
  const pimlicoClient = createPimlicoClient({ transport: http(bundlerUrl), entryPoint: { address: entryPoint07Address, version: "0.7" } });
  const client = createSmartAccountClient({
    account: safeAccount, chain, bundlerTransport: http(bundlerUrl),
    userOperation: { estimateFeesPerGas: async () => (await pimlicoClient.getUserOperationGasPrice()).fast },
  });

  // Build removeConfig calls for each session on the emissary
  const calls = toRevoke.map(({ permissionId }) => {
    const data = encodeFunctionData({
      abi: removeConfigAbi,
      functionName: "removeConfig",
      args: [
        wallet.smartAccountAddress,
        {
          scope: SCOPE_MULTICHAIN,
          resetPeriod: RESET_PERIOD_ONE_WEEK,
          allocator: zeroAddress,
          permissionId: permissionId as Hex,
        },
        {
          allocatorSig: zeroHash,
          userSig: "0x" as Hex,
          expires: maxUint256,
        },
      ],
    });
    return { to: SMART_SESSION_EMISSARY_ADDRESS, value: 0n, data };
  });
  const hash = await client.sendTransaction({ calls });

  // Update local file
  for (const { key } of toRevoke) {
    delete sessions[key];
  }
  if (Object.keys(sessions).length === 0) {
    unlinkSync(".session.json");
  } else {
    writeFileSync(".session.json", JSON.stringify(sessions, null, 2));
    chmodSync(".session.json", 0o600);
  }

  console.log(`Revoked! tx: ${hash}`);
  const names = toRevoke.map(({ key }) => key).join(", ");
  console.log(`Sessions disabled on-chain and removed locally: ${names}`);
}

main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
