import { chmodSync, existsSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { isAddress, type Address } from "viem";
import { chain } from "./config.js";

export interface WalletState {
  owner: Address;
  smartAccountAddress: Address;
  chainId: number;
}

export interface SessionState {
  sessionPrivateKey: `0x${string}`;
  serialized: string;
  smartAccountAddress: Address;
  chainId: number;
  preset: string;
  validAfter?: number;
  expiresAt: number;
  limit: string;
  sessionSignerAddress: Address;
  recipient?: Address;
}

export type SessionMap = Record<string, SessionState>;

export function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch (error) {
    fail(`Could not read ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function loadWallet(): WalletState;
export function loadWallet(options: { optional: true }): WalletState | undefined;
export function loadWallet(options: { optional?: boolean } = {}): WalletState | undefined {
  if (!existsSync(".wallet.json")) {
    if (options.optional) return undefined;
    fail("No .wallet.json. Run: pnpm run setup");
  }

  const raw = readJson(".wallet.json") as Partial<WalletState>;
  if (!raw.owner || !isAddress(raw.owner)) fail(".wallet.json has an invalid owner address.");
  if (!raw.smartAccountAddress || !isAddress(raw.smartAccountAddress)) fail(".wallet.json has an invalid smartAccountAddress.");
  if (raw.chainId !== chain.id) {
    fail(`Wallet was created for chain ${raw.chainId}, but CHAIN is ${chain.name} (${chain.id}).`);
  }
  return raw as WalletState;
}

export function normalizeSessions(raw: any): SessionMap {
  if (!raw || typeof raw !== "object") fail(".session.json is not a valid session map.");
  if (raw.sessionPrivateKey) return { [raw.preset]: raw as SessionState };
  return raw as SessionMap;
}

export function loadSessions(): SessionMap;
export function loadSessions(options: { optional: true }): SessionMap;
export function loadSessions(options: { optional?: boolean } = {}): SessionMap {
  if (!existsSync(".session.json")) {
    if (options.optional) return {};
    fail("No .session.json. Run: pnpm run grant");
  }
  return normalizeSessions(readJson(".session.json"));
}

export function loadSession(presetKey: string): SessionState {
  const sessions = loadSessions();
  const session = sessions[presetKey];
  if (!session) fail(`No session for preset "${presetKey}". Run: pnpm run grant -- --preset ${presetKey}`);
  if (session.chainId !== chain.id) {
    fail(`Session "${presetKey}" was created for chain ${session.chainId}, but CHAIN is ${chain.name} (${chain.id}).`);
  }
  if (session.expiresAt && Date.now() / 1000 > session.expiresAt) {
    fail("Session expired. Run: pnpm run grant");
  }
  return session;
}

export function writeSessions(sessions: SessionMap) {
  if (Object.keys(sessions).length === 0) {
    if (existsSync(".session.json")) unlinkSync(".session.json");
    return;
  }
  writeFileSync(".session.json", JSON.stringify(sessions, null, 2));
  chmodSync(".session.json", 0o600);
}

export function saveSession(presetKey: string, session: SessionState) {
  const sessions = loadSessions({ optional: true });
  sessions[presetKey] = session;
  writeSessions(sessions);
}
