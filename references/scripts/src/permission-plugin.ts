import { addressToEmptyAccount } from "@zerodev/sdk";
import { toPermissionValidator } from "@zerodev/permissions";
import { toECDSASigner } from "@zerodev/permissions/signers";
import { toCallPolicy, toTimestampPolicy, ParamCondition, CallPolicyVersion } from "@zerodev/permissions/policies";
import { privateKeyToAccount } from "viem/accounts";
import { isHex, pad, toHex, type Address, type Hex } from "viem";
import { KERNEL_VERSION } from "./account.js";
import type { ProtocolAction, ProtocolPolicyRule, ProtocolPreset } from "./presets.js";
import { fail } from "./state.js";

function buildArgPolicies(action: ProtocolAction, limit: bigint, smartAccount: Address, recipient?: Address): any[] | undefined {
  const indexes = [
    ...Object.keys(action.fixedArgs || {}).map(Number),
    ...Object.keys(action.grantArgs || {}).map(Number),
    action.amountArgIndex,
  ].filter((index): index is number => index !== undefined);
  if (indexes.length === 0) return undefined;

  const args: any[] = Array(Math.max(...indexes) + 1).fill(null);
  for (const [index, value] of Object.entries(action.fixedArgs || {})) {
    args[Number(index)] = { condition: ParamCondition.EQUAL, value };
  }
  for (const [index, source] of Object.entries(action.grantArgs || {})) {
    if (source === "recipient") {
      if (!recipient) fail("--to <address> is required when granting transfer sessions.");
      args[Number(index)] = { condition: ParamCondition.EQUAL, value: recipient };
    } else if (source === "smartAccount") {
      args[Number(index)] = { condition: ParamCondition.EQUAL, value: smartAccount };
    }
  }
  if (action.amountArgIndex !== undefined) {
    args[action.amountArgIndex] = { condition: ParamCondition.LESS_THAN_OR_EQUAL, value: limit };
  }
  return args;
}

function toParamCondition(condition: ProtocolPolicyRule["condition"]) {
  if (condition === "eq") return ParamCondition.EQUAL;
  if (condition === "gt") return ParamCondition.GREATER_THAN;
  return ParamCondition.LESS_THAN_OR_EQUAL;
}

function resolveRuleValue(rule: ProtocolPolicyRule, limit: bigint, smartAccount: Address, recipient?: Address): Address | bigint {
  if (rule.source === "limit") return limit;
  if (rule.source === "smartAccount") return smartAccount;
  if (rule.source === "recipient") {
    if (!recipient) fail("--to <address> is required when granting transfer sessions.");
    return recipient;
  }
  if (rule.value === undefined) fail(`Permission rule for offset ${rule.offset} is missing a value.`);
  return rule.value;
}

function encodeRuleValue(value: Address | bigint): Hex {
  if (typeof value === "bigint") return toHex(value, { size: 32 });
  if (isHex(value, { strict: true })) return pad(value, { size: 32 });
  return pad(toHex(value), { size: 32 });
}

function buildManualRules(action: ProtocolAction, limit: bigint, smartAccount: Address, recipient?: Address): any[] | undefined {
  if (!action.policyRules) return undefined;
  return action.policyRules.map((rule) => ({
    condition: toParamCondition(rule.condition),
    offset: rule.offset,
    params: [encodeRuleValue(resolveRuleValue(rule, limit, smartAccount, recipient))],
  }));
}

export async function buildPermissionPlugin({
  publicClient,
  entryPoint,
  preset,
  limit,
  smartAccount,
  recipient,
  validAfter,
  validUntil,
  sessionSignerAddress,
  sessionPrivateKey,
}: {
  publicClient: any;
  entryPoint: any;
  preset: ProtocolPreset;
  limit: bigint;
  smartAccount: Address;
  recipient?: Address;
  validAfter: number;
  validUntil: number;
  sessionSignerAddress?: Address;
  sessionPrivateKey?: `0x${string}`;
}) {
  const signerAccount = sessionPrivateKey
    ? privateKeyToAccount(sessionPrivateKey)
    : addressToEmptyAccount(sessionSignerAddress!);
  const signer = await toECDSASigner({ signer: signerAccount });
  const callPermissions = preset.actions.map((action) => {
    const rules = buildManualRules(action, limit, smartAccount, recipient);
    if (rules) {
      return {
        target: action.address,
        selector: action.selector,
        rules,
      };
    }

    const args = buildArgPolicies(action, limit, smartAccount, recipient);
    return {
      target: action.address,
      selector: action.selector,
      abi: action.abi,
      functionName: action.functionName,
      ...(args ? { args } : {}),
    };
  });

  return toPermissionValidator(publicClient, {
    entryPoint,
    signer,
    policies: [
      toTimestampPolicy({ validAfter, validUntil }),
      toCallPolicy({
        policyVersion: CallPolicyVersion.V0_0_4,
        permissions: callPermissions,
      }),
    ],
    kernelVersion: KERNEL_VERSION,
  });
}
