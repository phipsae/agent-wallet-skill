export function normalizeArgs(args: string[]): string[] {
  return args[0] === "--" ? args.slice(1) : args;
}

export function getArg(args: string[], name: string): string | undefined {
  args = normalizeArgs(args);
  const index = args.indexOf(`--${name}`);
  return index !== -1 && args[index + 1] && !args[index + 1].startsWith("--") ? args[index + 1] : undefined;
}

export function hasFlag(args: string[], name: string): boolean {
  args = normalizeArgs(args);
  return args.includes(`--${name}`);
}
