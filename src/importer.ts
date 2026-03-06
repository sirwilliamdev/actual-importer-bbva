// Self-signed certs are common on local Actual Budget instances
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

import * as api from "@actual-app/api";
import { mkdirSync } from "fs";
import type { BbvaTransaction } from "./parser.js";

export interface Config {
  serverURL: string;
  password: string;
  budgetId: string; // groupId / syncId (used for downloadBudget)
  defaultAccountId: string; // account UUID or name
}

export async function importTransactions(
  config: Config,
  accountArg: string,
  transactions: BbvaTransaction[]
): Promise<void> {
  mkdirSync(".actual-cache", { recursive: true });
  await api.init({
    serverURL: config.serverURL,
    password: config.password,
    dataDir: ".actual-cache",
  });

  // downloadBudget takes the groupId/syncId; loadBudget takes the local file id
  await api.downloadBudget(config.budgetId);
  const budgets = await api.getBudgets();
  const budget = budgets.find((b) => b.groupId === config.budgetId && b.id);
  if (!budget?.id) {
    throw new Error(`Could not find downloaded budget for groupId ${config.budgetId}`);
  }
  await api.loadBudget(budget.id);

  // Resolve account: support both UUID and account name
  const accounts = await api.getAccounts();
  const account =
    accounts.find((a) => a.id === accountArg) ??
    accounts.find((a) => a.name === accountArg);
  if (!account) {
    console.error(
      "Available accounts:\n" +
        accounts.map((a) => `  id=${a.id}  name="${a.name}"`).join("\n")
    );
    throw new Error(`Account not found: "${accountArg}"`);
  }
  const accountId = account.id;
  console.log(`Importing into account: "${account.name}" (${accountId})`);

  const mapped = transactions.map((t) => ({
    account: accountId,
    date: t.date,
    amount: t.amount,
    payee_name: t.payee,
    imported_payee: t.payee,
    notes: t.notes,
    imported_id: t.importedId,
    cleared: true,
  }));

  const result = await api.importTransactions(accountId, mapped);

  const added = result.added?.length ?? 0;
  const updated = result.updated?.length ?? 0;
  const errors = result.errors?.length ?? 0;
  const skipped = transactions.length - added - updated;

  console.log(`Parsed ${transactions.length} transactions from file.`);
  console.log(
    `Added: ${added}, Updated: ${updated}, Already existed: ${skipped > 0 ? skipped : 0}, Errors: ${errors}`
  );

  if (errors > 0) {
    console.error("Errors:", result.errors);
  }
}
