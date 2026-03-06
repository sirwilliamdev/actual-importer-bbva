import ExcelJS from "exceljs";

export interface BbvaTransaction {
  date: string; // YYYY-MM-DD (from D. valor column)
  payee: string; // Concepte
  amount: number; // integer cents: Math.round(Import * 100), negative = outflow
  importedId: string; // dedup key: "D.valor|Data|Concepte|Import"
  notes: string; // Observacions (raw bank description)
}

function parseDate(raw: unknown): string {
  const s = String(raw).trim();
  // Expected format: DD/MM/YYYY
  const [day, month, year] = s.split("/");
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export async function parseBbvaFile(
  filePath: string
): Promise<BbvaTransaction[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error("No worksheet found in file");

  // Find header row by scanning for a cell containing 'D. valor'
  let headerRowNumber = -1;
  worksheet.eachRow((row, rowNumber) => {
    if (headerRowNumber !== -1) return;
    row.eachCell((cell) => {
      if (String(cell.value).trim() === "D. valor") {
        headerRowNumber = rowNumber;
      }
    });
  });

  if (headerRowNumber === -1) {
    throw new Error("Could not find header row with 'D. valor' in the file");
  }

  // Read column indices from the header row
  const headerRow = worksheet.getRow(headerRowNumber);
  const headerValues = headerRow.values as unknown[];
  let colDValor = -1, colData = -1, colConcepte = -1, colImport = -1, colObservacions = -1;
  for (let i = 1; i < headerValues.length; i++) {
    const h = String(headerValues[i] ?? "").trim();
    if (h === "D. valor" && colDValor === -1) colDValor = i;
    else if (h === "Data" && colData === -1) colData = i;
    else if (h === "Concepte" && colConcepte === -1) colConcepte = i;
    else if (h === "Import" && colImport === -1) colImport = i;
    else if (h === "Observacions" && colObservacions === -1) colObservacions = i;
  }
  if (colDValor === -1 || colData === -1 || colConcepte === -1 || colImport === -1) {
    throw new Error("Could not find required columns in header row");
  }

  const transactions: BbvaTransaction[] = [];

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
    const dValorStr = String(dValor ?? "").trim();
    const dataStr = String(data ?? "").trim();
    const observacions = colObservacions !== -1 ? String(values[colObservacions] ?? "").trim() : "";

    transactions.push({
      date: parseDate(dataStr),
      payee,
      amount,
      importedId: `${dValorStr}|${dataStr}|${payee}|${importValue}`,
      notes: observacions,
    });
  });

  return transactions;
}
