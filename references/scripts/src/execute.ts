import { readFileSync } from "fs";
import { createPublicClient, http, parseUnits, encodeFunctionData, encodeAbiParameters, type Address, type Hex } from "viem";
import { privateKeyToAccount, toAccount } from "viem/accounts";
import { toSafeSmartAccount } from "permissionless/accounts";
import { createSmartAccountClient } from "permissionless";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { entryPoint07Address, getUserOperationHash } from "viem/account-abstraction";
import { getAccountNonce } from "permissionless/actions";
import { OWNABLE_VALIDATOR_ADDRESS, SMART_SESSION_EMISSARY_ADDRESS } from "@rhinestone/sdk";
import { packSignature } from "@rhinestone/sdk/smart-sessions";
import type { Session, Policy } from "@rhinestone/sdk";
import { chain, rpcUrl, bundlerUrl, validateEnv } from "./config.js";
import { PRESETS, buildTransferPreset, getToken } from "./presets.js";
import { SAFE_4337_MODULE, SAFE_LAUNCHPAD, encodeEmissaryNonceKey } from "./account.js";

const RHINESTONE_ATTESTER_ADDRESS = "0x000000333034E9f539ce08819E12c1b8Cb29084d" as Address;

// Mock ECDSA signature for gas estimation (65 bytes)
const MOCK_ECDSA_SIG = "0xe8b94748580ca0b4993c9a1b86b5be851bfc076ff5ce3a1ff65bf16392acfcb800f9b4f1aef1555c7fce5599fffb17e7c635502154a0333ba21f3ae491839af51c" as Hex;

function loadSession(presetKey: string): any {
  let file: any;
  try { file = JSON.parse(readFileSync(".session.json", "utf-8")); }
  catch { console.error("No .session.json. Run: pnpm run create-session"); process.exit(1); }

  let raw: any;
  if (file.sessionPrivateKey) {
    raw = file;
  } else {
    raw = file[presetKey];
    if (!raw) { console.error(`No session for preset "${presetKey}". Run: pnpm run create-session --preset ${presetKey}`); process.exit(1); }
  }

  let wallet: any;
  try { wallet = JSON.parse(readFileSync(".wallet.json", "utf-8")); }
  catch { console.error("No .wallet.json. Run: pnpm run setup"); process.exit(1); }

  return { ...raw, owner: wallet.owner };
}

function reconstructSession(sessionData: any): Session {
  const sessionSigner = privateKeyToAccount(sessionData.sessionPrivateKey);
  const limit = parseUnits(sessionData.limit, sessionData.spendTokenDecimals);

  return {
    owners: {
      type: "ecdsa" as const,
      accounts: [sessionSigner],
      threshold: 1,
    },
    actions: sessionData.actions.map((action: any) => ({
      target: action.target as Address,
      selector: action.selector as Hex,
      policies: [
        { type: "time-frame" as const, validUntil: sessionData.expiresAt * 1000, validAfter: 0 },
        ...(action.hasSpendingLimit
          ? [{ type: "spending-limits" as const, limits: [{ token: action.target as Address, amount: limit }] }]
          : []),
      ] satisfies Policy[],
    })),
    chain,
  };
}

async function buildAgentAccount(owner: Address, smartAccountAddress: Address) {
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });

  const ownerStub = toAccount({
    address: owner,
    async signMessage() { throw new Error("Session key flow - owner signing not used"); },
    async signTransaction() { throw new Error("Not needed"); },
    async signTypedData() { throw new Error("Session key flow - owner signing not used"); },
  });

  const ownableValidator = {
    address: OWNABLE_VALIDATOR_ADDRESS,
    initData: encodeAbiParameters(
      [{ name: "threshold", type: "uint256" }, { name: "owners", type: "address[]" }],
      [1n, [owner.toLowerCase() as Address].sort()],
    ),
  };

  return toSafeSmartAccount({
    client: publicClient,
    owners: [ownerStub],
    address: smartAccountAddress,
    version: "1.4.1",
    entryPoint: { address: entryPoint07Address, version: "0.7" },
    safe4337ModuleAddress: SAFE_4337_MODULE,
    erc7579LaunchpadAddress: SAFE_LAUNCHPAD,
    attesters: [RHINESTONE_ATTESTER_ADDRESS],
    attestersThreshold: 1,
    validators: [
      { address: ownableValidator.address, context: ownableValidator.initData },
      { address: SMART_SESSION_EMISSARY_ADDRESS, context: "0x" as Hex },
    ],
  });
}

async function sendSessionTx(sessionData: any, session: Session, calls: Array<{ to: Address; data: Hex }>): Promise<Hex> {
  const sessionOwner = privateKeyToAccount(sessionData.sessionPrivateKey);
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const pimlicoClient = createPimlicoClient({ transport: http(bundlerUrl), entryPoint: { address: entryPoint07Address, version: "0.7" } });
  const safeAccount = await buildAgentAccount(sessionData.owner, sessionData.smartAccountAddress);
  const client = createSmartAccountClient({
    account: safeAccount, chain, bundlerTransport: http(bundlerUrl),
    userOperation: { estimateFeesPerGas: async () => (await pimlicoClient.getUserOperationGasPrice()).fast },
  });

  // Nonce key: emissary address right-padded to 24 bytes
  const nonce = await getAccountNonce(publicClient, {
    address: safeAccount.address, entryPointAddress: entryPoint07Address,
    key: encodeEmissaryNonceKey(),
  });

  // Mock signature for gas estimation (USE mode)
  const mockSig = packSignature(
    { type: "experimental_session", session, verifyExecutions: true },
    MOCK_ECDSA_SIG,
  );

  const userOp = await client.prepareUserOperation({
    account: safeAccount, calls: calls.map((call) => ({ ...call, value: 0n })),
    nonce, signature: mockSig,
  });

  // Hash and sign with session key
  const hash = getUserOperationHash({ chainId: chain.id, entryPointAddress: entryPoint07Address, entryPointVersion: "0.7", userOperation: userOp });
  const signature = await sessionOwner.signMessage({ message: { raw: hash } });

  // Real signature (USE mode)
  userOp.signature = packSignature(
    { type: "experimental_session", session, verifyExecutions: true },
    signature,
  );

  const opHash = await client.sendUserOperation(userOp);
  const receipt = await pimlicoClient.waitForUserOperationReceipt({ hash: opHash });
  return receipt.receipt.transactionHash;
}

async function main() {
  validateEnv();

  let presetKey: string | undefined;
  let amountStr = "10";
  let recipient: Address | undefined;
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--preset" && args[index + 1]) presetKey = args[index + 1];
    if (args[index] === "--amount" && args[index + 1]) amountStr = args[index + 1];
    if (args[index] === "--to" && args[index + 1]) recipient = args[index + 1] as Address;
  }
  if (!presetKey) { console.error("--preset is required (e.g. --preset uniswap-swap)"); process.exit(1); }

  const sessionData = loadSession(presetKey);

  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const code = await publicClient.getCode({ address: sessionData.smartAccountAddress });
  if (!code || code === "0x") { console.error("Safe not deployed. Run: pnpm run deploy"); process.exit(1); }
  if (sessionData.expiresAt && Date.now() / 1000 > sessionData.expiresAt) { console.error("Session expired. Run: pnpm run create-session"); process.exit(1); }

  let preset;
  if (sessionData.preset?.startsWith("transfer:")) {
    const token = getToken(sessionData.preset.split(":")[1]);
    if (!token) { console.error(`Unknown token in preset: ${sessionData.preset}`); process.exit(1); }
    preset = buildTransferPreset(token);
  } else {
    preset = PRESETS[sessionData.preset];
  }
  if (!preset) { console.error(`Unknown preset: ${sessionData.preset}`); process.exit(1); }
  const amount = parseUnits(amountStr, preset.spendToken.decimals);

  if (sessionData.preset?.startsWith("transfer:") && !recipient) {
    console.error("--to <address> is required for transfers"); process.exit(1);
  }

  // Reconstruct the Session object from stored data
  const session = reconstructSession(sessionData);

  console.log(`Account: ${sessionData.smartAccountAddress}`);
  console.log(`Preset:  ${preset.name}`);
  console.log(`Amount:  ${amountStr} ${preset.spendToken.symbol}`);
  if (recipient) console.log(`To:      ${recipient}`);
  console.log();

  for (let index = 0; index < preset.execute.length; index++) {
    const step = preset.execute[index];
    console.log(`${index + 1}. ${step.label}...`);
    const data = encodeFunctionData({ abi: step.abi, functionName: step.functionName, args: step.buildArgs({ amount, smartAccount: sessionData.smartAccountAddress, recipient }) });
    const txHash = await sendSessionTx(sessionData, session, [{ to: step.to, data }]);
    console.log(`   tx: ${txHash}`);
  }
  console.log(`\nDone.`);
}

main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
