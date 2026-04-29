import { http, parseUnits } from "viem";
import { createKernelAccountClient } from "@zerodev/sdk";
import { chain, bundlerUrl, validateEnv } from "./config.js";
import { buildSignableKernelAccount, getPublicClient, getEntryPointConfig } from "./account.js";
import { createUserOperationFeeEstimator } from "./fees.js";
import { getArg } from "./args.js";
import { fail, loadSessions, loadWallet, writeSessions } from "./state.js";
import { runMain } from "./run.js";
import { resolvePreset } from "./presets.js";
import { buildPermissionPlugin } from "./permission-plugin.js";

export async function main(args = process.argv.slice(2)) {
  validateEnv();
  const wallet = loadWallet();
  const sessions = loadSessions();
  const presetKey = getArg(args, "preset");

  // Determine which sessions to revoke
  const toRevoke: Array<{ key: string; session: any }> = [];
  if (presetKey) {
    if (!sessions[presetKey]) fail(`No session for preset "${presetKey}".`);
    toRevoke.push({ key: presetKey, session: sessions[presetKey] });
  } else {
    for (const [key, session] of Object.entries(sessions)) {
      toRevoke.push({ key, session });
    }
  }

  console.log(`Revoking ${toRevoke.length} session(s)...`);
  console.log("Your browser wallet will open to sign.\n");

  const publicClient = getPublicClient();
  const entryPoint = getEntryPointConfig();

  const kernelAccount = await buildSignableKernelAccount(wallet.owner);

  const sudoClient = createKernelAccountClient({
    account: kernelAccount,
    chain,
    bundlerTransport: http(bundlerUrl),
    userOperation: {
      estimateFeesPerGas: createUserOperationFeeEstimator(),
    },
  });

  for (const { key, session } of toRevoke) {
    console.log(`Revoking "${key}" (signer: ${session.sessionSignerAddress.slice(0, 10)}...)...`);

    const resolved = resolvePreset(session.preset);
    if (!resolved) fail(`Unknown preset in session "${key}": ${session.preset}`);
    if (!session.validAfter) fail(`Session "${key}" was created by an older runtime and cannot be safely reconstructed for revocation.`);
    const limit = parseUnits(session.limit, resolved.preset.spendToken.decimals);
    const permissionPlugin = await buildPermissionPlugin({
      publicClient,
      entryPoint,
      preset: resolved.preset,
      limit,
      smartAccount: wallet.smartAccountAddress,
      recipient: session.recipient,
      validAfter: session.validAfter,
      validUntil: session.expiresAt,
      sessionPrivateKey: session.sessionPrivateKey,
    });

    // uninstallPlugin removes the permission validator on-chain
    const hash = await sudoClient.uninstallPlugin({
      plugin: permissionPlugin,
    });
    console.log(`  tx: ${hash}`);
  }

  // Update local file
  for (const { key } of toRevoke) {
    delete sessions[key];
  }
  writeSessions(sessions);

  const names = toRevoke.map(({ key }) => key).join(", ");
  console.log(`\nRevoked and removed locally: ${names}`);
}

runMain(import.meta.url, main);
