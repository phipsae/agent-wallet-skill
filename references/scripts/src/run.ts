import { pathToFileURL } from "url";

export function runMain(importMetaUrl: string, main: (args?: string[]) => Promise<void>) {
  const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
  if (entryUrl !== importMetaUrl) return;

  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

