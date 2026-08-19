import ExcelJS from "exceljs";
import type { Transaction } from "actual-importer";
import { withOccurrence } from "actual-importer/keys";
import { buildKey } from "./keys.js";

export { KEY_VERSION, buildKey, migrateKey, type BbvaKeyParts } from "./keys.js";

// BBVA spells the value-date column differently per report: "Últims moviments"
// exports use 'D. valor', "Moviments" exports use 'Data valor'.
const VALUE_DATE_HEADERS = ["D. valor", "Data valor"];

export interface BbvaStatement {
  transactions: Transaction[];
  // Running balance after the most recent movement, when the export includes
  // the 'Disponible' column ("Moviments" reports have it, "Últims moviments"
  // reports do not). Integer cents.
  availableBalance?: number;
}

function parseDate(raw: unknown): string {
  // ExcelJS returns either a plain DD/MM/YYYY string or a real Date, depending
  // on how the cell is formatted in the export.
  if (raw instanceof Date) {
    const y = raw.getUTCFullYear();
    const m = String(raw.getUTCMonth() + 1).padStart(2, "0");
    const d = String(raw.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(raw).trim();
  const match = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) {
    throw new Error(`Unrecognised date value: ${JSON.stringify(raw)}`);
  }
  const [, day, month, year] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

interface SheetLayout {
  worksheet: ExcelJS.Worksheet;
  headerRowNumber: number;
  colDValor: number;
  colData: number;
  colConcepte: number;
  colImport: number;
  colObservacions: number;
  colDisponible: number;
}

async function readLayout(filePath: string): Promise<SheetLayout> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error("No worksheet found in file");

  let headerRowNumber = -1;
  worksheet.eachRow((row, rowNumber) => {
    if (headerRowNumber !== -1) return;
    row.eachCell((cell) => {
      if (VALUE_DATE_HEADERS.includes(String(cell.value).trim())) {
        headerRowNumber = rowNumber;
      }
    });
  });

  if (headerRowNumber === -1) {
    throw new Error(
      `Could not find header row with ${VALUE_DATE_HEADERS.map((h) => `'${h}'`).join(" or ")} in the file`
    );
  }

  const headerValues = worksheet.getRow(headerRowNumber).values as unknown[];
  let colDValor = -1,
    colData = -1,
    colConcepte = -1,
    colImport = -1,
    colObservacions = -1,
    colDisponible = -1;
  for (let i = 1; i < headerValues.length; i++) {
    const h = String(headerValues[i] ?? "").trim();
    if (VALUE_DATE_HEADERS.includes(h) && colDValor === -1) colDValor = i;
    else if (h === "Data" && colData === -1) colData = i;
    else if (h === "Concepte" && colConcepte === -1) colConcepte = i;
    else if (h === "Import" && colImport === -1) colImport = i;
    else if (h === "Observacions" && colObservacions === -1) colObservacions = i;
    else if (h === "Disponible" && colDisponible === -1) colDisponible = i;
  }
  if (colDValor === -1 || colData === -1 || colConcepte === -1 || colImport === -1) {
    throw new Error("Could not find required columns in header row");
  }

  return {
    worksheet,
    headerRowNumber,
    colDValor,
    colData,
    colConcepte,
    colImport,
    colObservacions,
    colDisponible,
  };
}

export async function parseBbvaStatement(filePath: string): Promise<BbvaStatement> {
  const layout = await readLayout(filePath);
  const {
    worksheet,
    headerRowNumber,
    colDValor,
    colData,
    colConcepte,
    colImport,
    colObservacions,
    colDisponible,
  } = layout;

  const transactions: Transaction[] = [];
  // BBVA exports carry no per-transaction reference, so two genuinely distinct
  // movements can share date, concept and amount — two 500 € transfers on the
  // same day are a real thing here. Counting occurrences within the file is
  // what keeps their keys distinct.
  const occurrences = new Map<string, number>();

  let latestDate = "";
  let availableBalance: number | undefined;

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowNumber) return;

    const values = row.values as unknown[];
    const dValor = values[colDValor];
    const data = values[colData];
    const concepte = values[colConcepte];
    const importValue = values[colImport];

    // Skip empty rows
    if (!dValor && !concepte && !importValue) return;

    const amount = Math.round(Number(importValue) * 100);
    const payee = String(concepte ?? "").trim();
    const observacions = colObservacions !== -1 ? String(values[colObservacions] ?? "").trim() : "";
    const date = parseDate(data);

    const baseId = buildKey({ valueDate: parseDate(dValor), date, payee, amountCents: amount });
    const occurrence = (occurrences.get(baseId) ?? 0) + 1;
    occurrences.set(baseId, occurrence);

    transactions.push({
      date,
      payee,
      amount,
      importedId: withOccurrence(baseId, occurrence),
      notes: observacions,
    });

    // Rows are exported newest-first, so the first row seen for the newest date
    // carries the closing balance.
    if (colDisponible !== -1 && date > latestDate) {
      const disponible = values[colDisponible];
      if (disponible !== undefined && disponible !== null && String(disponible).trim() !== "") {
        latestDate = date;
        availableBalance = Math.round(Number(disponible) * 100);
      }
    }
  });

  return { transactions, availableBalance };
}

export async function parseBbvaFile(filePath: string): Promise<Transaction[]> {
  const { transactions } = await parseBbvaStatement(filePath);
  return transactions;
}
