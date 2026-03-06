import { readFileSync } from "fs";

const CSV_PATH =
  "/home/guillemc/personal/money/src/utils/data/db_expense_category.csv";

// Map from lowercase-trimmed payee name → Actual Budget category name
let payeeToCategoryName: Map<string, string> | null = null;
// Map from category name → Actual Budget category ID
let categoryNameToId: Map<string, string> | null = null;

function loadCsv(): Map<string, string> {
  if (payeeToCategoryName) return payeeToCategoryName;

  const content = readFileSync(CSV_PATH, "utf-8");
  const lines = content.split("\n");
  const map = new Map<string, string>();

  for (const line of lines.slice(1)) {
    // skip header
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Handle quoted fields (e.g., "Caprabo asturies, 6",Category)
    let concepte: string;
    let categoria: string;

    if (trimmed.startsWith('"')) {
      const closingQuote = trimmed.indexOf('",', 1);
      if (closingQuote === -1) continue;
      concepte = trimmed.slice(1, closingQuote);
      categoria = trimmed.slice(closingQuote + 2);
    } else {
      const commaIdx = trimmed.indexOf(",");
      if (commaIdx === -1) continue;
      concepte = trimmed.slice(0, commaIdx);
      categoria = trimmed.slice(commaIdx + 1);
    }

    map.set(concepte.toLowerCase().trim(), categoria.trim());
  }

  payeeToCategoryName = map;
  return map;
}

export function initCategories(
  actualCategories: Array<{ id: string; name: string }>
): void {
  categoryNameToId = new Map(
    actualCategories.map((c) => [c.name.trim(), c.id])
  );
}

export function resolveCategoryId(payee: string): string | undefined {
  const csvMap = loadCsv();
  const categoryName = csvMap.get(payee.toLowerCase().trim());
  if (!categoryName) return undefined;
  if (!categoryNameToId) return undefined;
  return categoryNameToId.get(categoryName);
}
