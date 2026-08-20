import { test } from "node:test";
import assert from "node:assert/strict";
import { KEY_VERSION, buildKey, migrateKey, settledConcept } from "../src/keys.ts";

test("a key is version, both dates, concept and a two-decimal amount", () => {
  assert.equal(
    buildKey({
      valueDate: "2026-08-03",
      date: "2026-08-03",
      payee: "Fleca can pep",
      amountCents: -1795,
    }),
    "bbva4|2026-08-03|2026-08-03|Fleca can pep|-17.95"
  );
});

test("repeated movements are numbered from the second one", () => {
  const parts = { valueDate: "2026-04-29", date: "2026-04-29", payee: "Bizum", amountCents: 50000 };
  assert.equal(buildKey(parts), "bbva4|2026-04-29|2026-04-29|Bizum|500.00");
  assert.equal(buildKey(parts, 2), "bbva4|2026-04-29|2026-04-29|Bizum|500.00|#2");
});

// The bug v3 exists for: BBVA ships a card payment padded to 40 characters
// while it is recent, then trimmed to the merchant once it settles. Both
// spellings are the same purchase and must key identically.
const PADDED: [string, string][] = [
  ["Fleca can pep            camallera    es", "Fleca can pep"],
  ["Comerc nonell            sant jordi dees", "Comerc nonell"],
  ["T263 girona alimentacio  girona       es", "T263 girona alimentacio"],
  ["Ikea girona hfb          girona-2 urbaes", "Ikea girona hfb"],
  // The merchant fills all 25 characters and runs straight into the town.
  ["Casa moner ametller gironaiguaviva    es", "Casa moner ametller giron"],
];

for (const [padded, merchant] of PADDED) {
  test(`the padded and settled forms of ${merchant} share a key`, () => {
    assert.equal(settledConcept(padded), merchant);
    const parts = { valueDate: "2026-08-01", date: "2026-08-03", amountCents: -1274 };
    assert.equal(buildKey({ ...parts, payee: padded }), buildKey({ ...parts, payee: merchant }));
  });
}

test("free text of any other length survives whole", () => {
  for (const concept of [
    "Aixeta",
    "Traspàs des de compte",
    "Càrrec arag s.e. sucursal en espana",
    // 39 characters, and the closest free text comes to the padded shape: only
    // the absence of a padding run keeps it whole.
    "Càrrec vera - gurbtec iguana telecom sl",
    "Anul.lacio carrec arag s.e. sucursal en espana",
    "Càrrec per amortització de préstec/cr.",
  ]) {
    assert.equal(settledConcept(concept), concept);
  }
});

// The bug v4 exists for: BBVA's encoding of a non-ASCII character in this field
// is not stable, so the same padded concept arrives at more than one length and
// a length test alone stops recognising it. Every case is a real spelling of a
// row that reached the budget one way and the export the other.
const DAMAGED: [string, string, string][] = [
  // The `ç` of `LLIÇÀ DE MUNT` dropped: 39 characters, damage after the merchant.
  ["Esclatoil 4070ll         llia de muntes", "Esclatoil 4070ll", "town byte dropped"],
  ["Joaros llica             llia de valles", "Joaros llica", "town byte dropped"],
  // The same byte decoded as two characters instead of none: 41.
  ["Esclatoil 4070ll         lliÃ§Ã  de munes", "Esclatoil 4070ll", "town byte doubled"],
  // Damage inside the merchant shifts the town a column early, so cutting at
  // column 25 would take its first letter. `Comerç nonell` settles as
  // `Comer nonell`, which is what the cut has to produce.
  ["Comer nonell            sant jordi dees", "Comer nonell", "merchant byte dropped"],
  // A merchant carrying a double space of its own is not cut short at it.
  ["Uber   *eats            barcelona    es", "Uber   *eats", "merchant has its own run"],
];

for (const [damaged, merchant, why] of DAMAGED) {
  test(`a padded concept still keys as ${merchant} when a byte is off (${why})`, () => {
    assert.equal(settledConcept(damaged), merchant);
    const parts = { valueDate: "2026-06-27", date: "2026-06-29", amountCents: -1500 };
    assert.equal(buildKey({ ...parts, payee: damaged }), buildKey({ ...parts, payee: merchant }));
  });
}

test("a damaged length with no padding run is left whole rather than guessed at", () => {
  // Nothing distinguishes this from free text, so it must not be cut.
  assert.equal(
    settledConcept("Casa moner ametller gironaiguaviva   es"),
    "Casa moner ametller gironaiguaviva   es"
  );
});

// The two keys `[BBVA] Despeses variables` held that no export could reproduce:
// imported from a monthly export that dropped the `ç`, so v3 read them as free
// text and kept the town in the key.
const V3_MIGRATIONS: [string, string][] = [
  [
    "bbva3|2026-06-27|2026-06-29|Esclatoil 4070ll         llia de muntes|-15.00",
    "bbva4|2026-06-27|2026-06-29|Esclatoil 4070ll|-15.00",
  ],
  [
    "bbva3|2026-06-27|2026-06-29|Joaros llica             llia de valles|-2.00",
    "bbva4|2026-06-27|2026-06-29|Joaros llica|-2.00",
  ],
  // Already collapsed by v3: only the version stamp changes.
  ["bbva3|2026-08-01|2026-08-03|Fleca can pep|-17.95", "bbva4|2026-08-01|2026-08-03|Fleca can pep|-17.95"],
  ["bbva3|2026-03-01|2026-03-03|Aixeta|-3.50", "bbva4|2026-03-01|2026-03-03|Aixeta|-3.50"],
  [
    "bbva3|2026-07-06|2026-07-06|Càrrec vera - gurbtec iguana telecom sl|-45.00",
    "bbva4|2026-07-06|2026-07-06|Càrrec vera - gurbtec iguana telecom sl|-45.00",
  ],
];

// Every case below is a real key taken from the budget before its migration.
const V1_MIGRATIONS: [string, string][] = [
  // The whole point of v2: amounts written without both decimals.
  [
    "05/03/2026|05/03/2026|Antiga casa bellsola     girona       es|-3.9",
    "bbva4|2026-03-05|2026-03-05|Antiga casa bellsola|-3.90",
  ],
  ["01/03/2026|03/03/2026|Aixeta|-3.5", "bbva4|2026-03-01|2026-03-03|Aixeta|-3.50"],
  ["03/03/2026|03/03/2026|Traspàs des de compte|1200", "bbva4|2026-03-03|2026-03-03|Traspàs des de compte|1200.00"],
  ["29/06/2026|29/06/2026|Traspàs des de compte|1394.5", "bbva4|2026-06-29|2026-06-29|Traspàs des de compte|1394.50"],
  ["06/07/2026|06/07/2026|Càrrec vera - gurbtec iguana telecom sl|-45", "bbva4|2026-07-06|2026-07-06|Càrrec vera - gurbtec iguana telecom sl|-45.00"],
  // Already two decimals: only the dates and the prefix change.
  [
    "31/07/2026|31/07/2026|Càrrec per amortització de préstec/cr.|-259.97",
    "bbva4|2026-07-31|2026-07-31|Càrrec per amortització de préstec/cr.|-259.97",
  ],
  // Value date and operation date differ.
  ["28/02/2026|02/03/2026|Bizum|-54.4", "bbva4|2026-02-28|2026-03-02|Bizum|-54.40"],
];

// The two that made the August import overshoot the bank balance by 30.69.
const V2_MIGRATIONS: [string, string][] = [
  [
    "bbva2|2026-08-01|2026-08-03|Fleca can pep            camallera    es|-17.95",
    "bbva4|2026-08-01|2026-08-03|Fleca can pep|-17.95",
  ],
  [
    "bbva2|2026-08-01|2026-08-03|Comerc nonell            sant jordi dees|-12.74",
    "bbva4|2026-08-01|2026-08-03|Comerc nonell|-12.74",
  ],
  // Nothing to collapse: only the version stamp changes.
  ["bbva2|2026-03-01|2026-03-03|Aixeta|-3.50", "bbva4|2026-03-01|2026-03-03|Aixeta|-3.50"],
  [
    "bbva2|2026-07-06|2026-07-06|Càrrec vera - gurbtec iguana telecom sl|-45.00",
    "bbva4|2026-07-06|2026-07-06|Càrrec vera - gurbtec iguana telecom sl|-45.00",
  ],
];

const MIGRATIONS = [...V1_MIGRATIONS, ...V2_MIGRATIONS, ...V3_MIGRATIONS];

for (const [before, after] of MIGRATIONS) {
  test(`migrates ${before}`, () => {
    assert.equal(migrateKey(before), after);
  });
}

test("a v1 key and the v2 key it became migrate to the same v4 key", () => {
  assert.equal(
    migrateKey("05/03/2026|05/03/2026|Antiga casa bellsola     girona       es|-3.9"),
    migrateKey("bbva2|2026-03-05|2026-03-05|Antiga casa bellsola     girona       es|-3.90")
  );
});

test("the occurrence suffix survives the migration", () => {
  assert.equal(
    migrateKey("10/04/2026|10/04/2026|Bizum|500|#2"),
    "bbva4|2026-04-10|2026-04-10|Bizum|500.00|#2"
  );
  assert.equal(
    migrateKey("bbva2|2026-04-10|2026-04-10|Bizum|500.00|#2"),
    "bbva4|2026-04-10|2026-04-10|Bizum|500.00|#2"
  );
});

test("a concept containing a pipe stays whole", () => {
  assert.equal(
    migrateKey("01/03/2026|01/03/2026|Bar | restaurant|-9.5"),
    "bbva4|2026-03-01|2026-03-01|Bar | restaurant|-9.50"
  );
  assert.equal(
    migrateKey("bbva2|2026-03-01|2026-03-01|Bar | restaurant|-9.50"),
    "bbva4|2026-03-01|2026-03-01|Bar | restaurant|-9.50"
  );
});

test("migrating is idempotent", () => {
  for (const [before] of MIGRATIONS) {
    const once = migrateKey(before);
    assert.equal(migrateKey(once), once);
  }
  assert.equal(
    migrateKey("bbva4|2026-04-10|2026-04-10|Bizum|500.00|#2"),
    "bbva4|2026-04-10|2026-04-10|Bizum|500.00|#2"
  );
});

test("every migrated key is stamped with the current version", () => {
  for (const [before] of MIGRATIONS) {
    assert.ok(migrateKey(before).startsWith(`${KEY_VERSION}|`));
  }
});

test("a key that is not a BBVA key is rejected rather than guessed at", () => {
  assert.throws(() => migrateKey("tr|2026-08-01T04:08:02|Interest|20.22|Zinsen"));
  assert.throws(() => migrateKey("nonsense"));
  assert.throws(() => migrateKey("2026-03-05|2026-03-05|Concepte|-3.9"), /Unrecognised date/);
  assert.throws(() => migrateKey("05/03/2026|05/03/2026|Concepte|not-a-number"), /Unrecognised amount/);
  assert.throws(() => migrateKey("bbva2|05/03/2026|05/03/2026|Concepte|-3.90"), /Unrecognised date/);
  assert.throws(() => migrateKey("bbva2|2026-03-05|Concepte|-3.90"), /Not a bbva2 BBVA key/);
  assert.throws(() => migrateKey("bbva3|2026-03-05|Concepte|-3.90"), /Not a bbva3 BBVA key/);
});
