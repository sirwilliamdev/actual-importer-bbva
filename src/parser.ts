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

  const transactions: BbvaTransaction[] = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowNumber) return;

    const values = row.values as unknown[]; // 1-indexed (index 0 is undefined in exceljs)
    // Column positions (1-indexed): B=2, C=3, D=4, E=5, F=6, G=7, H=8
    const dValor = values[2];
    const data = values[3];
    const concepte = values[4];
    const importValue = values[6];

    // Skip empty rows
    if (!dValor && !concepte && !importValue) return;

    const amount = Math.round(Number(importValue) * 100);
    const payee = String(concepte ?? "").trim();
    const dValorStr = String(dValor ?? "").trim();
    const dataStr = String(data ?? "").trim();
    const observacions = String(values[8] ?? "").trim();

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
