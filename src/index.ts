import "./polyfill.js";
import { readFileSync } from "fs";
import { resolve } from "path";
import { parseBbvaFile } from "./parser.js";
import { importTransactions, type Config } from "./importer.js";

function parseArgs(args: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--") && i + 1 < args.length) {
      const key = args[i].slice(2);
      result[key] = args[i + 1];
      i++;
    }
  }
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args["file"]) {
    console.error("Usage: tsx src/index.ts --file <path.xlsx> [--account-id <uuid>]");
    process.exit(1);
  }

  const filePath = resolve(args["file"]);

  const configPath = resolve("config.json");
  let config: Config;
  try {
    config = JSON.parse(readFileSync(configPath, "utf-8")) as Config;
  } catch {
    console.error(`Could not read config.json. Copy config.example.json to config.json and fill in your values.`);
    process.exit(1);
  }

  const accountId = args["account-id"] ?? config.defaultAccountId;
  if (!accountId) {
    console.error("No account ID provided. Use --account-id or set defaultAccountId in config.json.");
    process.exit(1);
  }

  console.log(`Parsing ${filePath}...`);
  const transactions = await parseBbvaFile(filePath);
  console.log(`Found ${transactions.length} transactions.`);

  await importTransactions(config, accountId, transactions);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
