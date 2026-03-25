import {
  createPublicClient, http, encodeAbiParameters, pad,
  type Address, type Hex,
} from "viem";
import { entryPoint07Address } from "viem/account-abstraction";
import { toSafeSmartAccount } from "permissionless/accounts";
import { toAccount } from "viem/accounts";
import { OWNABLE_VALIDATOR_ADDRESS, SMART_SESSION_EMISSARY_ADDRESS } from "@rhinestone/sdk";
import { chain, rpcUrl } from "./config.js";
import { requestBrowserSignature, type SessionMeta } from "./browser-signer.js";

export const SAFE_4337_MODULE = "0x7579EE8307284F293B1927136486880611F20002" as Address;
export const SAFE_LAUNCHPAD = "0x7579011aB74c46090561ea277Ba79D510c6C00ff" as Address;
const RHINESTONE_ATTESTER_ADDRESS = "0x000000333034E9f539ce08819E12c1b8Cb29084d" as Address;

function buildOwnableValidator(owners: Address[], threshold: number) {
  return {
    address: OWNABLE_VALIDATOR_ADDRESS,
    initData: encodeAbiParameters(
      [{ name: "threshold", type: "uint256" }, { name: "owners", type: "address[]" }],
      [BigInt(threshold), owners.map((o) => o.toLowerCase() as Address).sort()],
    ),
  };
}

function buildSmartSessionValidator() {
  return { address: SMART_SESSION_EMISSARY_ADDRESS, initData: "0x" as Hex };
}

export function encodeEmissaryNonceKey() {
  return BigInt(pad(SMART_SESSION_EMISSARY_ADDRESS, { dir: "right", size: 24 }));
}

export async function buildSafeAccount(owner: Address, saltNonce?: bigint) {
  const safeOwner = toAccount({
    address: owner,
    async signMessage() { throw new Error("Use buildSignableSafeAccount for signing"); },
    async signTransaction() { throw new Error("Not needed"); },
    async signTypedData() { throw new Error("Use buildSignableSafeAccount for signing"); },
  });
  return buildSafe(safeOwner, owner, saltNonce);
}

export async function buildSignableSafeAccount(owner: Address, sessionMeta?: SessionMeta, saltNonce?: bigint) {
  const safeOwner = toAccount({
    address: owner,
    async signMessage() { throw new Error("Use signTypedData"); },
    async signTransaction() { throw new Error("Not needed"); },
    async signTypedData(typedData) {
      const result = await requestBrowserSignature({
        title: "Authorize Transaction",
        description: "Sign to authorize this Safe operation. Check the details in your browser wallet.",
        typedData,
        chainId: chain.id,
        chainName: chain.name,
        sessionMeta,
      });
      return result.signature!;
    },
  });
  return buildSafe(safeOwner, owner, saltNonce);
}

async function buildSafe(safeOwner: any, owner: Address, saltNonce?: bigint) {
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const ownableValidator = buildOwnableValidator([owner], 1);
  const smartSessions = buildSmartSessionValidator();

  return toSafeSmartAccount({
    client: publicClient,
    owners: [safeOwner],
    version: "1.4.1",
    entryPoint: { address: entryPoint07Address, version: "0.7" },
    safe4337ModuleAddress: SAFE_4337_MODULE,
    erc7579LaunchpadAddress: SAFE_LAUNCHPAD,
    attesters: [RHINESTONE_ATTESTER_ADDRESS],
    attestersThreshold: 1,
    saltNonce,
    validators: [
      { address: ownableValidator.address, context: ownableValidator.initData },
      { address: smartSessions.address, context: smartSessions.initData },
    ],
  });
}
