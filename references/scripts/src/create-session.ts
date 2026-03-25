import { readFileSync, writeFileSync, chmodSync } from "fs";
import { createPublicClient, http, parseUnits, type Hex } from "viem";
import { entryPoint07Address } from "viem/account-abstraction";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createSmartAccountClient } from "permissionless";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import {
  getSessionDetails, getPermissionId, getEnableSessionCall,
} from "@rhinestone/sdk/smart-sessions";
import type { Session, Policy } from "@rhinestone/sdk";
import { chain, rpcUrl, bundlerUrl, validateEnv } from "./config.js";
import { PRESETS, listPresets, buildTransferPreset, getToken } from "./presets.js";
import { buildSignableSafeAccount } from "./account.js";
import { requestBrowserSignature } from "./browser-signer.js";

const APPROVE_SELECTOR = "0x095ea7b3" as Hex;
const TRANSFER_SELECTOR = "0xa9059cbb" as Hex;

const args = process.argv.slice(2);
function getArg(name: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  return index !== -1 && args[index + 1] ? args[index + 1] : undefined;
}

async function main() {
  if (args.includes("--list")) { console.log("Available presets:\n"); console.log(listPresets()); process.exit(0); }
  validateEnv();

  const wallet = JSON.parse(readFileSync(".wallet.json", "utf-8"));
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const code = await publicClient.getCode({ address: wallet.smartAccountAddress });
  if (!code || code === "0x") { console.error("Safe not deployed. Run: pnpm run deploy"); process.exit(1); }

  const presetKey = getArg("preset");
  let preset;
  if (presetKey?.startsWith("transfer:")) {
    const tokenId = presetKey.split(":")[1];
    const token = getToken(tokenId);
    if (!token) { console.error(`Unknown token "${tokenId}". Run --list for supported tokens.`); process.exit(1); }
    preset = buildTransferPreset(token);
  } else if (presetKey && PRESETS[presetKey]) {
    preset = PRESETS[presetKey];
  } else {
    console.error(`Unknown preset. Available:\n${listPresets()}`); process.exit(1);
  }

  const limitStr = getArg("limit");
  if (!limitStr) { console.error("--limit is required (e.g. --limit 100 for 100 " + preset.spendToken.symbol + ")"); process.exit(1); }
  const limit = parseUnits(limitStr, preset.spendToken.decimals);

  const durationStr = getArg("duration") || "24";
  const duration = parseInt(durationStr) * 3600;
  const validAfter = Math.floor(Date.now() / 1000);
  const validUntil = validAfter + duration;

  const sessionPrivateKey = generatePrivateKey();
  const sessionSigner = privateKeyToAccount(sessionPrivateKey);

  // Build session using new SDK's declarative format
  // TimeFramePolicy expects milliseconds (SDK divides by 1000 internally)
  const agentSession: Session = {
    owners: {
      type: "ecdsa" as const,
      accounts: [sessionSigner],
      threshold: 1,
    },
    actions: preset.actions.map((action) => ({
      target: action.address,
      selector: action.selector,
      policies: [
        { type: "time-frame" as const, validUntil: validUntil * 1000, validAfter: validAfter * 1000 },
        ...(action.selector === APPROVE_SELECTOR || action.selector === TRANSFER_SELECTOR
          ? [{ type: "spending-limits" as const, limits: [{ token: action.address, amount: limit }] }]
          : []),
      ] satisfies Policy[],
    })),
    chain,
  };

  const permissionId = getPermissionId(agentSession);
  const provider = { type: "custom" as const, urls: { [chain.id]: rpcUrl } };

  console.log("Preparing session details...");
  const details = await getSessionDetails(wallet.smartAccountAddress, [agentSession], provider);

  // Step 1: User signs session authorization (EIP-712 typed data)
  console.log("Step 1/2: Sign session authorization in your browser wallet.\n");
  const { signature: enableSignature } = await requestBrowserSignature({
    title: "Authorize Session Key",
    description: "Sign to authorize this session key. This grants the agent scoped, time-limited permissions.",
    typedData: details.data,
    chainId: chain.id,
    chainName: chain.name,
    sessionMeta: {
      limitAmount: limitStr,
      limitToken: preset.spendToken.symbol,
      durationHours: durationStr,
      expiresAt: validUntil,
    },
  });

  // Step 2: Send the enableSession call via Safe user operation
  console.log("\nStep 2/2: Sign the Safe transaction to enable the session on-chain.\n");
  const enableCall = await getEnableSessionCall(
    wallet.smartAccountAddress, agentSession, enableSignature!,
    details.hashesAndChainIds, 0,
  );

  const saltNonce = wallet.saltNonce ? BigInt(wallet.saltNonce) : undefined;
  const safeAccount = await buildSignableSafeAccount(wallet.owner, {
    limitAmount: limitStr,
    limitToken: preset.spendToken.symbol,
    durationHours: durationStr,
    expiresAt: validUntil,
  }, saltNonce);

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
    calls: [{ to: enableCall.to, value: 0n, data: enableCall.data }],
  });

  // Read existing sessions (if any) and merge
  let sessions: Record<string, any> = {};
  try {
    const existing = JSON.parse(readFileSync(".session.json", "utf-8"));
    if (existing.sessionPrivateKey) {
      sessions[existing.preset] = existing;
    } else {
      sessions = existing;
    }
  } catch {}

  sessions[presetKey!] = {
    sessionPrivateKey,
    permissionId,
    smartAccountAddress: wallet.smartAccountAddress,
    chainId: preset.chainId,
    preset: presetKey,
    expiresAt: validUntil,
    limit: limitStr,
    // Store data to reconstruct Session for execute.ts
    sessionSignerAddress: sessionSigner.address,
    actions: preset.actions.map((action) => ({
      target: action.address,
      selector: action.selector,
      hasSpendingLimit: action.selector === APPROVE_SELECTOR || action.selector === TRANSFER_SELECTOR,
    })),
    spendToken: preset.spendToken.address,
    spendTokenDecimals: preset.spendToken.decimals,
  };

  writeFileSync(".session.json", JSON.stringify(sessions, null, 2));
  chmodSync(".session.json", 0o600);

  console.log(`Enabled! tx: ${hash}`);
  console.log(`\nPreset:   ${preset.name}`);
  console.log(`Account:  ${wallet.smartAccountAddress}`);
  console.log(`Limit:    ${limitStr} ${preset.spendToken.symbol} (on-chain enforced)`);
  console.log(`Duration: ${durationStr}h`);
  console.log(`Expires:  ${new Date(validUntil * 1000).toLocaleString()}`);
  console.log(`\nThe agent can now run: pnpm run execute`);
}

main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
