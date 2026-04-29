import { encodeFunctionData, formatUnits, http, isAddress, parseUnits, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createKernelAccountClient } from "@zerodev/sdk";
import { deserializePermissionAccount } from "@zerodev/permissions";
import { toECDSASigner } from "@zerodev/permissions/signers";
import { chain, bundlerUrl, validateEnv } from "./config.js";
import { ERC20_ABI, getToken, resolvePreset, TOKENS } from "./presets.js";
import { getPublicClient, getEntryPointConfig, KERNEL_VERSION } from "./account.js";
import { createUserOperationFeeEstimator } from "./fees.js";
import { fail, loadSession, loadWallet } from "./state.js";
import { getArg, hasFlag } from "./args.js";
import { runMain } from "./run.js";

async function ensureDeployed(address: Address) {
  const publicClient = getPublicClient();
  const code = await publicClient.getCode({ address });
  if (!code || code === "0x") fail("Smart account is not deployed yet. Run: pnpm run deploy");
}

async function ensureTokenBalance(address: Address, token: { symbol: string; address: Address; decimals: number }, amount: bigint) {
  const publicClient = getPublicClient();
  const balance = await publicClient.readContract({
    address: token.address,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [address],
  });
  if (balance < amount) {
    fail(`Insufficient ${token.symbol}. Need ${formatUnits(amount, token.decimals)}, have ${formatUnits(balance, token.decimals)}.`);
  }
}

export async function main(args = process.argv.slice(2)) {
  validateEnv();

  const wallet = loadWallet();
  const presetKey = getArg(args, "preset");
  const amountStr = getArg(args, "amount");
  const recipientArg = getArg(args, "to");
  const minOutStr = getArg(args, "min-out");
  if (!presetKey) fail("--preset is required (e.g. --preset uniswap-swap)");
  if (!amountStr) fail("--amount is required");
  if (recipientArg && !isAddress(recipientArg)) fail(`Invalid --to address: ${recipientArg}`);

  const sessionData = loadSession(presetKey);
  if (sessionData.smartAccountAddress.toLowerCase() !== wallet.smartAccountAddress.toLowerCase()) {
    fail("Session file belongs to a different smart account. Recreate the session for this wallet.");
  }
  const resolved = resolvePreset(sessionData.preset);
  if (!resolved) fail(`Unknown preset: ${sessionData.preset}`);
  const { preset } = resolved;
  if (preset.chainId !== chain.id) fail(`${resolved.presetKey} is configured for Base mainnet (${preset.chainId}), but CHAIN is ${chain.name} (${chain.id}).`);

  const amount = parseUnits(amountStr, preset.spendToken.decimals);
  if (amount <= 0n) fail("--amount must be greater than zero.");
  const usdcHighValue = preset.spendToken.symbol === "USDC" && amount > parseUnits("50", preset.spendToken.decimals);
  if (usdcHighValue && !hasFlag(args, "confirmed-high-value")) {
    fail("Amount is over 50 USDC. Re-run with --confirmed-high-value after explicit user confirmation.");
  }

  let recipient = sessionData.recipient;
  if (sessionData.preset.startsWith("transfer:")) {
    if (!recipient) fail("This transfer session has no locked recipient. Recreate it with: pnpm run grant -- --preset <transfer:TOKEN> --to <address> --limit <amount>");
    if (recipientArg && recipientArg.toLowerCase() !== recipient.toLowerCase()) {
      fail(`Transfer session is locked to ${recipient}; refusing different --to ${recipientArg}.`);
    }
  } else if (recipientArg) {
    recipient = recipientArg as Address;
  }

  let minimumOut: bigint | undefined;
  if (sessionData.preset === "uniswap-swap") {
    const weth = getToken("WETH") || TOKENS.WETH;
    if (!minOutStr) fail("--min-out is required for uniswap-swap to avoid unsafe slippage.");
    minimumOut = parseUnits(minOutStr, weth.decimals);
    if (minimumOut <= 0n) fail("--min-out must be greater than zero.");
  }

  await ensureDeployed(wallet.smartAccountAddress);
  if (sessionData.preset !== "aave-withdraw") {
    await ensureTokenBalance(wallet.smartAccountAddress, preset.spendToken, amount);
  }

  // Reconstruct session key signer
  const sessionKeySigner = await toECDSASigner({
    signer: privateKeyToAccount(sessionData.sessionPrivateKey),
  });

  // Deserialize the permission account (lazy enable on first UserOp)
  const publicClient = getPublicClient();
  const entryPoint = getEntryPointConfig();

  const sessionKeyAccount = await deserializePermissionAccount(
    publicClient,
    entryPoint,
    KERNEL_VERSION,
    sessionData.serialized,
    sessionKeySigner,
  );

  const kernelClient = createKernelAccountClient({
    account: sessionKeyAccount,
    chain,
    bundlerTransport: http(bundlerUrl),
    userOperation: {
      estimateFeesPerGas: createUserOperationFeeEstimator(),
    },
  });

  console.log(`Account: ${sessionData.smartAccountAddress}`);
  console.log(`Preset:  ${preset.name}`);
  console.log(`Amount:  ${amountStr} ${preset.spendToken.symbol}`);
  if (recipient) console.log(`To:      ${recipient}`);
  if (minOutStr) console.log(`Min out: ${minOutStr} WETH`);
  console.log();

  for (let index = 0; index < preset.execute.length; index++) {
    const step = preset.execute[index];
    console.log(`${index + 1}. ${step.label}...`);
    const data = encodeFunctionData({
      abi: step.abi,
      functionName: step.functionName,
      args: step.buildArgs({ amount, smartAccount: sessionData.smartAccountAddress, recipient, minimumOut }),
    });

    const txHash = await kernelClient.sendTransaction({
      calls: [{ to: step.to, value: 0n, data }],
    });
    console.log(`   tx: ${txHash}`);
  }
  console.log(`\nDone.`);
}

runMain(import.meta.url, main);
