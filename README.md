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

## Category mapping

Transactions are auto-categorized using the CSV at:
```
/home/guillemc/personal/money/src/utils/data/db_expense_category.csv
```
Format: `CONCEPTE,CATEGORIA` — lowercase payee name → Actual Budget category name. Transactions with no match are imported without a category.

## BBVA Excel format

The tool auto-detects column positions from the header row, so it works with both the standard export format and the extended format (which adds `Disponible` columns):

`D. valor` · `Data` · `Concepte` · `Moviment` · `Import` · `Divisa` · [`Disponible` · `Divisa` ·] `Observacions`

The `Observacions` column (raw bank description including card number) is stored as the transaction note in Actual Budget.
