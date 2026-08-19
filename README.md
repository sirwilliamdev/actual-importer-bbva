# bbva-actual-importer

CLI tool to import transactions from a BBVA Spain Excel export into [Actual Budget](https://actualbudget.org/) via the `@actual-app/api`.

## Features

- Parses the `.xlsx` file exported from BBVA's online banking ("Últims moviments" / "Últimos movimientos")
- Auto-categorizes transactions using a local payee→category CSV mapping
- Deduplicates: safe to run multiple times on the same file
- Supports account lookup by name or UUID

## Requirements

- Node.js ≥ 20
- A running Actual Budget server
- `npm install` (also runs `scripts/setup-sqlite.sh` to compile the SQLite native module for your runtime — works with both system Node.js and Windsurf/Electron)

## Setup

```bash
npm install
cp config.example.json config.json
# Edit config.json with your server details
```

**`config.json`:**
```json
{
  "serverURL": "https://your-server:5006",
  "password": "your-password",
  "budgetId": "your-sync-id",
  "defaultAccountId": "Account Name or UUID"
}
```

> `budgetId` is the sync/group ID shown in Actual Budget's server settings, not the local file name.

## Usage

### 1. Download the Excel from BBVA

Log in to BBVA online banking, go to **Posició global** (or your account's movements), and click **Descarregar** / **Descargar** → **Excel**. Make sure to select **"Tots els moviments"** / **"Todos los movimientos"** to export all transactions (not just recent ones).

### 2. Run the importer

```bash
npx tsx src/index.ts --file ~/Downloads/moviments.xlsx
# or override the account:
npx tsx src/index.ts --file ~/Downloads/moviments.xlsx --account-id "Other Account"
```

## BBVA Excel format

The tool auto-detects column positions from the header row, so it works with both the standard export format and the extended format (which adds `Disponible` columns):

`D. valor` · `Data` · `Concepte` · `Moviment` · `Import` · `Divisa` · [`Disponible` · `Divisa` ·] `Observacions`

The `Observacions` column (raw bank description including card number) is stored as the transaction note in Actual Budget.

## Deduplication key

Every transaction carries an `imported_id`, the key Actual matches an incoming
transaction against an existing one by. BBVA exports have no per-transaction
reference, so the key is built from the row itself — which means every part of
it has to be normalised, or the same movement exported twice produces two
different keys and is imported twice:

```
bbva2|<value date>|<operation date>|<Concepte>|<Import>
bbva2|2026-04-10|2026-04-10|Bizum|500.00
```

Both dates are ISO, and the amount always carries two decimals. Two genuinely
distinct movements can be identical in everything the export reports (two 500 €
transfers on the same day is a real thing), so a key repeating within one file
is numbered: the first keeps the bare key, the second gets `|#2`, and so on.

`bbva2` is the second version of the format. Version 1 embedded the raw cell
text, so `-12.3` and `-12.30` were different keys and a date could arrive as a
string or as a `Date` depending on the export. Keys stored under v1 have to be
rewritten before importing with this version — `migrateKey()` translates one,
and the private pipeline's `migrate-ids` command does it across a whole budget.
