import type { Address, Hex } from "viem";

export const ERC20_ABI = [
  { inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], name: "approve", outputs: [{ name: "", type: "bool" }], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], name: "transfer", outputs: [{ name: "", type: "bool" }], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "account", type: "address" }], name: "balanceOf", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
] as const;

export const UNISWAP_V3_ROUTER_ABI = [{
  inputs: [{ components: [
    { name: "tokenIn", type: "address" }, { name: "tokenOut", type: "address" },
    { name: "fee", type: "uint24" }, { name: "recipient", type: "address" },
    { name: "amountIn", type: "uint256" },
    { name: "amountOutMinimum", type: "uint256" }, { name: "sqrtPriceLimitX96", type: "uint160" },
  ], name: "params", type: "tuple" }],
  name: "exactInputSingle", outputs: [{ name: "amountOut", type: "uint256" }],
  stateMutability: "payable", type: "function",
}] as const;

export const AAVE_POOL_ABI = [
  { inputs: [{ name: "asset", type: "address" }, { name: "amount", type: "uint256" }, { name: "onBehalfOf", type: "address" }, { name: "referralCode", type: "uint16" }], name: "supply", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "asset", type: "address" }, { name: "amount", type: "uint256" }, { name: "to", type: "address" }], name: "withdraw", outputs: [{ name: "", type: "uint256" }], stateMutability: "nonpayable", type: "function" },
] as const;

const SEL = {
  APPROVE: "0x095ea7b3" as Hex,
  TRANSFER: "0xa9059cbb" as Hex,
  EXACT_INPUT_SINGLE: "0x04e45aaf" as Hex,
  SUPPLY: "0x617ba037" as Hex,
  WITHDRAW: "0x69328dec" as Hex,
};

export interface ExecuteParams { amount: bigint; smartAccount: Address; recipient?: Address; }
export interface ExecuteStep { label: string; to: Address; abi: readonly any[]; functionName: string; buildArgs: (params: ExecuteParams) => any[]; }
export interface ProtocolPreset {
  name: string; description: string; chainId: number;
  actions: Array<{ label: string; address: Address; selector: Hex }>;
  spendToken: { symbol: string; address: Address; decimals: number };
  execute: ExecuteStep[];
}

const TOKENS: Record<string, { symbol: string; address: Address; decimals: number }> = {
  USDC: { symbol: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address, decimals: 6 },
  WETH: { symbol: "WETH", address: "0x4200000000000000000000000000000000000006" as Address, decimals: 18 },
  DAI:  { symbol: "DAI",  address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb" as Address, decimals: 18 },
  cbETH: { symbol: "cbETH", address: "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22" as Address, decimals: 18 },
};

export function getToken(symbolOrAddress: string): typeof TOKENS[string] | undefined {
  const upper = symbolOrAddress.toUpperCase();
  if (TOKENS[upper]) return TOKENS[upper];
  return Object.values(TOKENS).find((token) => token.address.toLowerCase() === symbolOrAddress.toLowerCase());
}

const USDC = TOKENS.USDC.address;
const WETH = TOKENS.WETH.address;
const UNISWAP_ROUTER = "0x2626664c2603336E57B271c5C0b26F421741e481" as Address;
const AAVE_POOL = "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5" as Address;

export function buildTransferPreset(token: typeof TOKENS[string]): ProtocolPreset {
  return {
    name: `${token.symbol} Transfer`, description: `Transfer ${token.symbol} to an address (Base)`, chainId: 8453,
    actions: [
      { label: `transfer ${token.symbol}`, address: token.address, selector: SEL.TRANSFER },
    ],
    spendToken: token,
    execute: [
      { label: `Transfer ${token.symbol}`, to: token.address, abi: ERC20_ABI, functionName: "transfer", buildArgs: (params) => [params.recipient, params.amount] },
    ],
  };
}

export const PRESETS: Record<string, ProtocolPreset> = {
  "uniswap-swap": {
    name: "Uniswap V3 Swap", description: "Swap USDC -> WETH on Uniswap V3 (Base)", chainId: 8453,
    actions: [
      { label: "exactInputSingle", address: UNISWAP_ROUTER, selector: SEL.EXACT_INPUT_SINGLE },
      { label: "approve USDC", address: USDC, selector: SEL.APPROVE },
    ],
    spendToken: TOKENS.USDC,
    execute: [
      { label: "Approve USDC", to: USDC, abi: ERC20_ABI, functionName: "approve", buildArgs: (params) => [UNISWAP_ROUTER, params.amount] },
      { label: "Swap USDC -> WETH", to: UNISWAP_ROUTER, abi: UNISWAP_V3_ROUTER_ABI, functionName: "exactInputSingle",
        buildArgs: (params) => [{ tokenIn: USDC, tokenOut: WETH, fee: 500, recipient: params.smartAccount, amountIn: params.amount, amountOutMinimum: 1n, sqrtPriceLimitX96: 0n }] },
    ],
  },
  "aave-supply": {
    name: "Aave V3 Supply", description: "Supply USDC to Aave V3 for yield (Base)", chainId: 8453,
    actions: [
      { label: "supply", address: AAVE_POOL, selector: SEL.SUPPLY },
      { label: "approve USDC", address: USDC, selector: SEL.APPROVE },
    ],
    spendToken: TOKENS.USDC,
    execute: [
      { label: "Approve USDC", to: USDC, abi: ERC20_ABI, functionName: "approve", buildArgs: (params) => [AAVE_POOL, params.amount] },
      { label: "Supply to Aave", to: AAVE_POOL, abi: AAVE_POOL_ABI, functionName: "supply", buildArgs: (params) => [USDC, params.amount, params.smartAccount, 0] },
    ],
  },
  "aave-withdraw": {
    name: "Aave V3 Withdraw", description: "Withdraw USDC from Aave V3 (Base)", chainId: 8453,
    actions: [
      { label: "withdraw", address: AAVE_POOL, selector: SEL.WITHDRAW },
    ],
    spendToken: TOKENS.USDC,
    execute: [
      { label: "Withdraw from Aave", to: AAVE_POOL, abi: AAVE_POOL_ABI, functionName: "withdraw", buildArgs: (params) => [USDC, params.amount, params.smartAccount] },
    ],
  },
};

export function listPresets(): string {
  const lines = Object.entries(PRESETS).map(([key, preset]) => `  ${key.padEnd(22)} ${preset.description}`);
  lines.push(`  ${"transfer:<TOKEN>".padEnd(22)} Transfer any supported token (${Object.keys(TOKENS).join(", ")})`);
  return lines.join("\n");
}
