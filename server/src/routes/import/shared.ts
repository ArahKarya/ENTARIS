import multer from 'multer';
import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';

// Multer config: memory storage, max 5MB
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.csv', '.xlsx', '.xls'];
    const ext = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Format file tidak didukung. Gunakan CSV atau Excel (.xlsx/.xls).'));
    }
  },
});

// Helper: Sanitize cell value to prevent formula injection
export function sanitizeCellValue(value: unknown): string {
  const str = String(value ?? '').trim();
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

// Helper: Parse uploaded file to array of objects
export async function parseFile(buffer: Buffer, filename: string): Promise<Record<string, string>[]> {
  const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));

  if (ext === '.csv') {
    return parse(buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
    }) as Record<string, string>[];
  }

  // Excel (.xlsx / .xls)
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error('File Excel kosong.');

  const headers: string[] = [];
  const rows: Record<string, string>[] = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        // Ensure headers array is properly indexed by column number
        while (headers.length < colNumber) {
          headers.push('');
        }
        headers[colNumber - 1] = String(cell.value ?? '').trim();
      });
    } else {
      const rowData: Record<string, string> = {};
      // Initialize all headers with empty string (equivalent to defval: '')
      for (const h of headers) {
        rowData[h] = '';
      }
      row.eachCell((cell, colNumber) => {
        const header = headers[colNumber - 1];
        if (header !== undefined) {
          // For formula cells, use the cached result; otherwise use the raw value
          const raw = cell.value;
          const resolved = (raw && typeof raw === 'object' && 'result' in raw)
            ? (raw as { result: unknown }).result
            : raw;
          rowData[header] = String(resolved ?? '');
        }
      });
      rows.push(rowData);
    }
  });

  return rows;
}
