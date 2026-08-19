import { test } from "node:test";
import assert from "node:assert/strict";
import { KEY_VERSION, buildKey, migrateKey } from "../src/keys.ts";

test("a key is version, both dates, concept and a two-decimal amount", () => {
  assert.equal(
    buildKey({
      valueDate: "2026-08-03",
      date: "2026-08-03",
      payee: "Fleca can pep            camallera    es",
      amountCents: -1795,
    }),
    "bbva2|2026-08-03|2026-08-03|Fleca can pep            camallera    es|-17.95"
  );
});

test("repeated movements are numbered from the second one", () => {
  const parts = { valueDate: "2026-04-29", date: "2026-04-29", payee: "Bizum", amountCents: 50000 };
  assert.equal(buildKey(parts), "bbva2|2026-04-29|2026-04-29|Bizum|500.00");
  assert.equal(buildKey(parts, 2), "bbva2|2026-04-29|2026-04-29|Bizum|500.00|#2");
});

// Every case below is a real v1 key taken from the budget before the migration.
const MIGRATIONS: [string, string][] = [
  // The whole point: amounts written without both decimals.
  [
    "05/03/2026|05/03/2026|Antiga casa bellsola     girona       es|-3.9",
    "bbva2|2026-03-05|2026-03-05|Antiga casa bellsola     girona       es|-3.90",
  ],
  ["01/03/2026|03/03/2026|Aixeta|-3.5", "bbva2|2026-03-01|2026-03-03|Aixeta|-3.50"],
  ["03/03/2026|03/03/2026|Traspàs des de compte|1200", "bbva2|2026-03-03|2026-03-03|Traspàs des de compte|1200.00"],
  ["29/06/2026|29/06/2026|Traspàs des de compte|1394.5", "bbva2|2026-06-29|2026-06-29|Traspàs des de compte|1394.50"],
  ["06/07/2026|06/07/2026|Càrrec vera - gurbtec iguana telecom sl|-45", "bbva2|2026-07-06|2026-07-06|Càrrec vera - gurbtec iguana telecom sl|-45.00"],
  // Already two decimals: only the dates and the prefix change.
  [
    "31/07/2026|31/07/2026|Càrrec per amortització de préstec/cr.|-259.97",
    "bbva2|2026-07-31|2026-07-31|Càrrec per amortització de préstec/cr.|-259.97",
  ],
  // Value date and operation date differ.
  ["28/02/2026|02/03/2026|Bizum|-54.4", "bbva2|2026-02-28|2026-03-02|Bizum|-54.40"],
];

for (const [before, after] of MIGRATIONS) {
  test(`migrates ${before}`, () => {
    assert.equal(migrateKey(before), after);
  });
}

test("the occurrence suffix survives the migration", () => {
  assert.equal(
    migrateKey("10/04/2026|10/04/2026|Bizum|500|#2"),
    "bbva2|2026-04-10|2026-04-10|Bizum|500.00|#2"
  );
});

test("a concept containing a pipe stays whole", () => {
  assert.equal(
    migrateKey("01/03/2026|01/03/2026|Bar | restaurant|-9.5"),
    "bbva2|2026-03-01|2026-03-01|Bar | restaurant|-9.50"
  );
});

test("migrating is idempotent", () => {
  for (const [before] of MIGRATIONS) {
    const once = migrateKey(before);
    assert.equal(migrateKey(once), once);
  }
  assert.equal(
    migrateKey("bbva2|2026-04-10|2026-04-10|Bizum|500.00|#2"),
    "bbva2|2026-04-10|2026-04-10|Bizum|500.00|#2"
  );
});

test("every migrated key is stamped with the current version", () => {
  for (const [before] of MIGRATIONS) {
    assert.ok(migrateKey(before).startsWith(`${KEY_VERSION}|`));
  }
});

test("a key that is not a v1 BBVA key is rejected rather than guessed at", () => {
  assert.throws(() => migrateKey("tr|2026-08-01T04:08:02|Interest|20.22|Zinsen"));
  assert.throws(() => migrateKey("nonsense"));
  assert.throws(() => migrateKey("2026-03-05|2026-03-05|Concepte|-3.9"), /Unrecognised date/);
  assert.throws(() => migrateKey("05/03/2026|05/03/2026|Concepte|not-a-number"), /Unrecognised amount/);
});
