import { main as setup } from "./setup.js";
import { main as deploy } from "./deploy.js";
import { main as status } from "./status.js";
import { main as balance } from "./balance.js";
import { main as grant } from "./create-session.js";
import { main as execute } from "./execute.js";
import { main as revoke } from "./revoke.js";
import { normalizeArgs } from "./args.js";
import { runMain } from "./run.js";

const commands: Record<string, (args?: string[]) => Promise<void>> = {
  setup,
  deploy,
  status,
  balance,
  grant,
  "create-session": grant,
  execute,
  revoke,
};

function usage() {
  console.log(`Usage: pnpm run wallet -- <command> [options]

Commands:
  setup           Connect owner wallet and derive the smart account address
  deploy          Deploy the ZeroDev Kernel smart account
  status          Show config, deployment, balances, and sessions
  balance         Show balances only
  grant           Create or replace a scoped session key
  execute         Execute with an existing session key
  revoke          Revoke one session or all sessions

Examples:
  pnpm run wallet -- grant --preset uniswap-swap --limit 100 --duration 24
  pnpm run wallet -- grant --preset transfer:USDC --to 0x... --limit 25
  pnpm run wallet -- execute --preset uniswap-swap --amount 10 --min-out 0.002
`);
}

export async function main(args = process.argv.slice(2)) {
  args = normalizeArgs(args);
  const [command, ...rest] = args;
  if (!command || command === "help" || command === "--help" || command === "-h") {
    usage();
    return;
  }

  const run = commands[command];
  if (!run) {
    usage();
    process.exit(1);
  }
  await run(rest);
}

runMain(import.meta.url, main);
