import { isAddress, parseUnits, type Address } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createKernelAccount } from "@zerodev/sdk";
import { serializePermissionAccount } from "@zerodev/permissions";
import { chain, validateEnv } from "./config.js";
import { listPresets, resolvePreset } from "./presets.js";
import { buildEcdsaValidator, browserSigner, getPublicClient, getEntryPointConfig, KERNEL_VERSION } from "./account.js";
import { getArg, hasFlag } from "./args.js";
import { fail, loadWallet, saveSession } from "./state.js";
import { runMain } from "./run.js";
import { buildPermissionPlugin } from "./permission-plugin.js";

export async function main(args = process.argv.slice(2)) {
  if (hasFlag(args, "list")) { console.log("Available presets:\n"); console.log(listPresets()); return; }
  validateEnv();

  const wallet = loadWallet();
  const publicClient = getPublicClient();
  const entryPoint = getEntryPointConfig();
  const code = await publicClient.getCode({ address: wallet.smartAccountAddress });
  if (!code || code === "0x") fail("Smart account is not deployed yet. Run: pnpm run deploy");

  const presetKey = getArg(args, "preset");
  const resolved = resolvePreset(presetKey);
  if (!resolved) fail(`Unknown preset. Available:\n${listPresets()}`);
  const { preset } = resolved;
  if (preset.chainId !== chain.id) fail(`${resolved.presetKey} is configured for Base mainnet (${preset.chainId}), but CHAIN is ${chain.name} (${chain.id}).`);

  const recipientArg = getArg(args, "to");
  const recipient = recipientArg as Address | undefined;
  if (recipientArg && !isAddress(recipientArg)) fail(`Invalid --to address: ${recipientArg}`);
  if (resolved.presetKey.startsWith("transfer:") && !recipient) fail("--to <address> is required when granting transfer sessions.");

  const limitStr = getArg(args, "limit");
  if (!limitStr) fail("--limit is required (e.g. --limit 100 for 100 " + preset.spendToken.symbol + ")");
  const limit = parseUnits(limitStr, preset.spendToken.decimals);
  if (limit <= 0n) fail("--limit must be greater than zero.");

  const durationStr = getArg(args, "duration") || "24";
  const duration = parseInt(durationStr) * 3600;
  if (!Number.isFinite(duration) || duration <= 0) fail("--duration must be a positive number of hours.");
  const validAfter = Math.floor(Date.now() / 1000);
  const validUntil = validAfter + duration;

  // Generate session key
  const sessionPrivateKey = generatePrivateKey();
  const sessionKeyAccount = privateKeyToAccount(sessionPrivateKey);

  const permissionPlugin = await buildPermissionPlugin({
    publicClient,
    entryPoint,
    preset,
    limit,
    smartAccount: wallet.smartAccountAddress,
    recipient,
    validAfter,
    validUntil,
    sessionSignerAddress: sessionKeyAccount.address,
  });

  // Build owner's browser-backed signer for the enable signature
  const ecdsaValidator = await buildEcdsaValidator(browserSigner(wallet.owner, {
    title: "Authorize Session Key",
    description: "Sign to authorize this session key. This grants the agent scoped, time-limited permissions.",
    sessionMeta: {
      presetName: preset.name,
      actions: preset.actions.map((a) => a.label),
      limitAmount: limitStr,
      limitToken: preset.spendToken.symbol,
      durationHours: durationStr,
      expiresAt: validUntil,
    },
  }));

  // Create kernel account with both sudo (owner) and regular (permission) validators
  const sessionKeyKernelAccount = await createKernelAccount(publicClient, {
    entryPoint,
    plugins: {
      sudo: ecdsaValidator,
      regular: permissionPlugin,
    },
    kernelVersion: KERNEL_VERSION,
  });

  // Serialize; this captures the enable signature (triggers 1 browser sign).
  console.log("Sign session authorization in your browser wallet.\n");
  const serialized = await serializePermissionAccount(sessionKeyKernelAccount);

  // Save session data
  saveSession(resolved.presetKey, {
    sessionPrivateKey,
    serialized,
    smartAccountAddress: wallet.smartAccountAddress,
    chainId: preset.chainId,
    preset: resolved.presetKey,
    validAfter,
    expiresAt: validUntil,
    limit: limitStr,
    sessionSignerAddress: sessionKeyAccount.address,
    ...(recipient ? { recipient } : {}),
  });

  console.log(`\nSession created!`);
  console.log(`\nPreset:   ${preset.name}`);
  console.log(`Account:  ${wallet.smartAccountAddress}`);
  if (recipient) console.log(`To:       ${recipient}`);
  console.log(`Limit:    ${limitStr} ${preset.spendToken.symbol} per transaction (policy enforced)`);
  console.log(`Duration: ${durationStr}h`);
  console.log(`Expires:  ${new Date(validUntil * 1000).toLocaleString()}`);
  console.log(`\nSTOP: Do not execute yet. Report this to the user and ask for explicit confirmation before running any transaction.`);
}

runMain(import.meta.url, main);
