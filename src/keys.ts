import { withOccurrence, splitOccurrence, formatKeyAmount, parseKeyAmount } from "actual-importer/keys";

// BBVA exports carry no per-transaction reference, so the dedup key has to be
// built from the row itself. Every part is normalised, because the same
// movement must produce the same key from any export it appears in.
//
// v3 (`bbva3`) collapses the fixed-width `Concepte` of a card payment to the
// merchant alone; see `settledConcept`.
// v2 (`bbva2`) normalised both dates to ISO and the amount to two decimals.
// v1 embedded the raw cell text, so `-12.3` and `-12.30` were different keys,
// and a `Moviments` export could disagree with an `Últims moviments` one
// whenever ExcelJS handed back a Date rather than a string. Transactions
// imported under an older version were migrated in place; see the pipeline's
// `migrate-ids`.
export const KEY_VERSION = "bbva3";

const V2 = "bbva2";

// A card payment reaches us in a fixed-width `Concepte`: 25 characters of
// merchant, 13 of town, 2 of country code, padded to exactly 40. Once the
// movement settles BBVA stops shipping the location and the very same purchase
// arrives as the trimmed merchant alone — so `Comerc nonell            sant
// jordi dees` and `Comerc nonell` are one transaction, and a key built from the
// raw cell changes underneath us between two exports.
//
// Only the exact 40-character shape is touched. Everything else is free text —
// `Càrrec ...` direct debits run to 46 characters and must survive whole.
const PADDED_LENGTH = 40;
const MERCHANT_WIDTH = 25;

export function settledConcept(concepte: string): string {
  if (concepte.length !== PADDED_LENGTH) return concepte;
  return concepte.slice(0, MERCHANT_WIDTH).trim();
}

export interface BbvaKeyParts {
  /** Value date (`D. valor` / `Data valor`), as YYYY-MM-DD. */
  valueDate: string;
  /** Operation date (`Data`), as YYYY-MM-DD. */
  date: string;
  /** `Concepte`, trimmed. Padded card-payment concepts are collapsed. */
  payee: string;
  /** `Import` in integer cents. */
  amountCents: number;
}

export function buildKey(parts: BbvaKeyParts, occurrence = 1): string {
  const base = [
    KEY_VERSION,
    parts.valueDate,
    parts.date,
    settledConcept(parts.payee),
    formatKeyAmount(parts.amountCents),
  ].join("|");
  return withOccurrence(base, occurrence);
}

/**
 * Translate a v1 or v2 key into its v3 form. Idempotent: a key that is already
 * v3 is returned untouched, so the migration can be re-run safely.
 *
 * v1 shape: `DD/MM/YYYY|DD/MM/YYYY|Concepte|<raw amount>`.
 * v2 shape: `bbva2|YYYY-MM-DD|YYYY-MM-DD|Concepte|<amount>`.
 * Both may carry the optional `|#N` suffix, and `Concepte` may itself contain a
 * `|`, so the payee is whatever sits between the leading dates and the
 * trailing amount.
 */
export function migrateKey(oldKey: string): string {
  if (oldKey.startsWith(`${KEY_VERSION}|`)) return oldKey;

  const { base, occurrence } = splitOccurrence(oldKey);
  const parts = base.split("|");

  if (parts[0] === V2) {
    if (parts.length < 5) {
      throw new Error(`Not a v2 BBVA key: ${JSON.stringify(oldKey)}`);
    }
    return buildKey(
      {
        valueDate: checkIsoDate(parts[1]),
        date: checkIsoDate(parts[2]),
        payee: parts.slice(3, -1).join("|"),
        amountCents: parseKeyAmount(parts[parts.length - 1]),
      },
      occurrence
    );
  }

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

function checkIsoDate(raw: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new Error(`Unrecognised date in BBVA key: ${JSON.stringify(raw)}`);
  }
  return raw;
}
