import { createPublicClient, http, type Address } from "viem";
import { toAccount } from "viem/accounts";
import { createKernelAccount } from "@zerodev/sdk";
import { getEntryPoint, KERNEL_V3_1 } from "@zerodev/sdk/constants";
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
import { chain, rpcUrl } from "./config.js";
import { requestBrowserSignature, type SessionMeta } from "./browser-signer.js";

export const KERNEL_VERSION = KERNEL_V3_1;

export function getPublicClient() {
  return createPublicClient({ chain, transport: http(rpcUrl) });
}

export function getEntryPointConfig() {
  return getEntryPoint("0.7");
}

/** Non-signing stub for address derivation only. */
function ownerStub(address: Address) {
  return toAccount({
    address,
    async signMessage() { throw new Error("Use buildSignableKernelAccount for signing"); },
    async signTransaction() { throw new Error("Not needed"); },
    async signTypedData() { throw new Error("Use buildSignableKernelAccount for signing"); },
  });
}

/** Owner signer that routes signing through the browser wallet. */
export function browserSigner(
  address: Address,
  opts?: { sessionMeta?: SessionMeta; title?: string; description?: string },
) {
  const title = opts?.title ?? "Authorize Transaction";
  const description = opts?.description ?? "Sign to authorize this operation. Check your browser wallet.";
  return toAccount({
    address,
    async signMessage({ message }) {
      const raw = typeof message === "string" ? undefined : message.raw;
      const result = await requestBrowserSignature({
        title, description,
        rawHash: raw as any,
        chainId: chain.id,
        chainName: chain.name,
        sessionMeta: opts?.sessionMeta,
      });
      return result.signature!;
    },
    async signTransaction() { throw new Error("Not needed"); },
    async signTypedData(typedData) {
      const result = await requestBrowserSignature({
        title, description,
        typedData,
        chainId: chain.id,
        chainName: chain.name,
        sessionMeta: opts?.sessionMeta,
      });
      return result.signature!;
    },
  });
}

/** Build ECDSA validator for the owner (sudo). */
export async function buildEcdsaValidator(signer: any) {
  const publicClient = getPublicClient();
  const entryPoint = getEntryPointConfig();
  return signerToEcdsaValidator(publicClient, {
    signer,
    entryPoint,
    kernelVersion: KERNEL_VERSION,
  });
}

/** Build Kernel account for address computation only (no signing). */
export async function buildKernelAccount(owner: Address) {
  const publicClient = getPublicClient();
  const entryPoint = getEntryPointConfig();
  const ecdsaValidator = await buildEcdsaValidator(ownerStub(owner));
  return createKernelAccount(publicClient, {
    plugins: { sudo: ecdsaValidator },
    entryPoint,
    kernelVersion: KERNEL_VERSION,
  });
}

/** Build Kernel account with browser wallet signing (for deploy, session creation, revoke). */
export async function buildSignableKernelAccount(owner: Address, sessionMeta?: SessionMeta) {
  const publicClient = getPublicClient();
  const entryPoint = getEntryPointConfig();
  const ecdsaValidator = await buildEcdsaValidator(browserSigner(owner, { sessionMeta }));
  return createKernelAccount(publicClient, {
    plugins: { sudo: ecdsaValidator },
    entryPoint,
    kernelVersion: KERNEL_VERSION,
  });
}
