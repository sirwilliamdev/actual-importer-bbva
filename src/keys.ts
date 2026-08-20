import { withOccurrence, splitOccurrence, formatKeyAmount, parseKeyAmount } from "actual-importer/keys";

// BBVA exports carry no per-transaction reference, so the dedup key has to be
// built from the row itself. Every part is normalised, because the same
// movement must produce the same key from any export it appears in.
//
// v4 (`bbva4`) recognises the padded shape when a mis-decoded byte has changed
// its length; see `settledConcept`.
// v3 (`bbva3`) collapses the fixed-width `Concepte` of a card payment to the
// merchant alone.
// v2 (`bbva2`) normalised both dates to ISO and the amount to two decimals.
// v1 embedded the raw cell text, so `-12.3` and `-12.30` were different keys,
// and a `Moviments` export could disagree with an `Últims moviments` one
// whenever ExcelJS handed back a Date rather than a string. Transactions
// imported under an older version were migrated in place; see the pipeline's
// `migrate-ids`.
export const KEY_VERSION = "bbva4";

const V2 = "bbva2";
const V3 = "bbva3";

// A card payment reaches us in a fixed-width `Concepte`: 25 characters of
// merchant, 13 of town, 2 of country code, padded to exactly 40. Once the
// movement settles BBVA stops shipping the location and the very same purchase
// arrives as the trimmed merchant alone — so `Comerc nonell            sant
// jordi dees` and `Comerc nonell` are one transaction, and a key built from the
// raw cell changes underneath us between two exports.
//
// Free text of any other length survives whole: `Càrrec ...` direct debits run
// to 46 characters, and `Càrrec vera - gurbtec iguana telecom sl` is 39.
const PADDED_LENGTH = 40;
const MERCHANT_WIDTH = 25;

// v4: BBVA's encoding of a non-ASCII character in this field is not stable.
// `LLIÇÀ DE MUNT` reached us once with the `ç` dropped and once with it decoded
// as U+0080, so the same padded concept arrived at 39 and at 40 characters.
// A length test alone therefore misses the damaged copies, and the key changes
// underneath a movement already in the budget — the exact failure v3 exists to
// prevent, one layer down.
//
// So a concept whose length is off by up to two is still read as padded when it
// carries the padding itself: a run of two or more spaces starting inside the
// merchant field. Measured over all 5309 concept cells in every export held,
// no free text of any length satisfies that, and all 49 genuinely padded rows
// are unaffected.
const DAMAGED_MIN_LENGTH = 38;
const DAMAGED_MAX_LENGTH = 42;
const PADDING_RUN = / {2,}/g;

// The cut is made at the padding run rather than at column 25, because a
// dropped byte shifts everything after it: `Comerç nonell` losing its `ç`
// leaves the town one column early, and slicing at 25 would take the first
// letter of the town with it. Cutting at the padding gives `Comer nonell`,
// which is what the settled form of that same row actually says.
//
// The last qualifying run wins, so a merchant containing a double space of its
// own (`Uber   *eats`) is not cut short at it.
function paddingCut(concepte: string): number {
  let cut = -1;
  for (const match of concepte.matchAll(PADDING_RUN)) {
    if (match.index !== undefined && match.index < MERCHANT_WIDTH) cut = match.index;
  }
  return cut;
}

export function settledConcept(concepte: string): string {
  if (concepte.length === PADDED_LENGTH) return concepte.slice(0, MERCHANT_WIDTH).trim();
  if (concepte.length < DAMAGED_MIN_LENGTH || concepte.length > DAMAGED_MAX_LENGTH) return concepte;
  const cut = paddingCut(concepte);
  return cut === -1 ? concepte : concepte.slice(0, cut).trim();
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
 * Translate a v1, v2 or v3 key into its v4 form. Idempotent: a key that is
 * already v4 is returned untouched, so the migration can be re-run safely.
 *
 * v1 shape: `DD/MM/YYYY|DD/MM/YYYY|Concepte|<raw amount>`.
 * v2 / v3 shape: `bbva<N>|YYYY-MM-DD|YYYY-MM-DD|Concepte|<amount>`.
 * All may carry the optional `|#N` suffix, and `Concepte` may itself contain a
 * `|`, so the payee is whatever sits between the leading dates and the
 * trailing amount.
 *
 * A v3 key differs from its v4 form only where `settledConcept` now recognises
 * a padded concept it used to leave whole, so re-deriving it is what repairs
 * the damaged copies.
 */
export function migrateKey(oldKey: string): string {
  if (oldKey.startsWith(`${KEY_VERSION}|`)) return oldKey;

  const { base, occurrence } = splitOccurrence(oldKey);
  const parts = base.split("|");

  if (parts[0] === V2 || parts[0] === V3) {
    if (parts.length < 5) {
      throw new Error(`Not a ${parts[0]} BBVA key: ${JSON.stringify(oldKey)}`);
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
