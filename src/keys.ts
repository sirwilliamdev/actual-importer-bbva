import { withOccurrence, splitOccurrence, formatKeyAmount, parseKeyAmount } from "actual-importer/keys";

// BBVA exports carry no per-transaction reference, so the dedup key has to be
// built from the row itself. Every part is normalised, because the same
// movement must produce the same key from any export it appears in.
//
// v2 (`bbva2`) normalises both dates to ISO and the amount to two decimals.
// v1 embedded the raw cell text, so `-12.3` and `-12.30` were different keys,
// and a `Moviments` export could disagree with an `Últims moviments` one
// whenever ExcelJS handed back a Date rather than a string. Transactions
// imported under v1 were migrated in place; see the pipeline's `migrate-ids`.
export const KEY_VERSION = "bbva2";

export interface BbvaKeyParts {
  /** Value date (`D. valor` / `Data valor`), as YYYY-MM-DD. */
  valueDate: string;
  /** Operation date (`Data`), as YYYY-MM-DD. */
  date: string;
  /** `Concepte`, trimmed. */
  payee: string;
  /** `Import` in integer cents. */
  amountCents: number;
}

export function buildKey(parts: BbvaKeyParts, occurrence = 1): string {
  const base = [
    KEY_VERSION,
    parts.valueDate,
    parts.date,
    parts.payee,
    formatKeyAmount(parts.amountCents),
  ].join("|");
  return withOccurrence(base, occurrence);
}

/**
 * Translate a v1 key into its v2 form. Idempotent: a key that is already v2 is
 * returned untouched, so the migration can be re-run safely.
 *
 * v1 shape: `DD/MM/YYYY|DD/MM/YYYY|Concepte|<raw amount>` with the same
 * optional `|#N` suffix. `Concepte` may itself contain a `|`, so the payee is
 * whatever sits between the two leading dates and the trailing amount.
 */
export function migrateKey(oldKey: string): string {
  if (oldKey.startsWith(`${KEY_VERSION}|`)) return oldKey;

  const { base, occurrence } = splitOccurrence(oldKey);
  const parts = base.split("|");
  if (parts.length < 4) {
    throw new Error(`Not a v1 BBVA key: ${JSON.stringify(oldKey)}`);
  }
  return buildKey(
    {
      valueDate: isoDate(parts[0]),
      date: isoDate(parts[1]),
      payee: parts.slice(2, -1).join("|"),
      amountCents: parseKeyAmount(parts[parts.length - 1]),
    },
    occurrence
  );
}

function isoDate(raw: string): string {
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) {
    throw new Error(`Unrecognised date in BBVA key: ${JSON.stringify(raw)}`);
  }
  const [, day, month, year] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}
