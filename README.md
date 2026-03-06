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

Download your movements from BBVA ("Descargar" → Excel) then run:

```bash
npx tsx src/index.ts --file ~/Downloads/moviments.xlsx
# or override the account:
npx tsx src/index.ts --file ~/Downloads/moviments.xlsx --account-id "Other Account"
```

## Category mapping

Transactions are auto-categorized using the CSV at:
```
/home/guillemc/personal/money/src/utils/data/db_expense_category.csv
```
Format: `CONCEPTE,CATEGORIA` — lowercase payee name → Actual Budget category name. Transactions with no match are imported without a category.

## BBVA Excel format

The tool expects the standard BBVA export with columns:
`D. valor` · `Data` · `Concepte` · `Moviment` · `Import` · `Divisa` · `Observacions`

The header row is detected automatically (rows above it are skipped).
