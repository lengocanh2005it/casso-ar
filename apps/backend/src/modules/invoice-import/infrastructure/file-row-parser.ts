import { extname } from 'node:path';
import { parse } from 'csv-parse/sync';
import { read, utils } from 'xlsx';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';

export const IMPORT_HEADERS = [
  'customerName',
  'customerTaxCode',
  'customerEmail',
  'invoiceNumber',
  'issueDate',
  'dueDate',
  'totalAmount',
  'taxAmount',
] as const;

export interface ParsedImportFile {
  rows: Record<string, unknown>[];
  totalRows: number;
}

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 1000;
const REQUIRED_HEADERS = new Set<string>(IMPORT_HEADERS);

const invalid = (message: string): never => {
  throw new AppError(ErrorCode.VALIDATION_ERROR, message);
};

const normalizeFirstHeader = (headers: unknown[]): string[] =>
  headers.map((header, index) => {
    if (typeof header === 'string') {
      return index === 0 ? header.replace(/^\uFEFF/, '') : header;
    }
    return invalid('Import headers must be strings');
  });

const validateHeaders = (headers: unknown[]): string[] => {
  const normalized = normalizeFirstHeader(headers);
  const seen = new Set<string>();

  for (const header of normalized) {
    if (seen.has(header)) invalid(`Duplicate import header: ${header}`);
    seen.add(header);
  }

  for (const header of IMPORT_HEADERS) {
    if (!seen.has(header)) invalid(`Missing import header: ${header}`);
  }

  return normalized;
};

const pickImportColumns = (
  row: Record<string, unknown>,
): Record<string, unknown> =>
  Object.fromEntries(IMPORT_HEADERS.map((header) => [header, row[header]]));

const enforceLimits = (
  buffer: Buffer,
  rows: Record<string, unknown>[],
): void => {
  if (buffer.byteLength > MAX_FILE_BYTES) invalid('Import file exceeds 5 MiB');
  if (rows.length === 0) invalid('Import file has no data rows');
  if (rows.length > MAX_ROWS) invalid('Import file exceeds 1,000 rows');
};

const parseCsv = (buffer: Buffer): Record<string, unknown>[] => {
  try {
    return parse<Record<string, unknown>>(buffer, {
      bom: true,
      columns: (headers: string[]) =>
        validateHeaders(headers).map((header) =>
          REQUIRED_HEADERS.has(header) ? header : false,
        ),
      delimiter: ',',
      skip_empty_lines: true,
      trim: true,
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    return invalid('Malformed CSV import file');
  }
};

const parseWorkbook = (buffer: Buffer): Record<string, unknown>[] => {
  try {
    const workbook = read(buffer, { cellDates: true, type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) return invalid('Import workbook has no sheets');

    const sheetRows = utils.sheet_to_json<unknown[]>(
      workbook.Sheets[firstSheetName],
      { blankrows: false, defval: null, header: 1, raw: true },
    );
    const [headers, ...dataRows] = sheetRows;
    if (!headers) return invalid('Import workbook has no header row');

    const normalizedHeaders = validateHeaders(headers);
    return dataRows.map((row) =>
      Object.fromEntries(
        normalizedHeaders.flatMap((header, index) =>
          REQUIRED_HEADERS.has(header) ? [[header, row[index]]] : [],
        ),
      ),
    );
  } catch (error) {
    if (error instanceof AppError) throw error;
    return invalid('Malformed workbook import file');
  }
};

export function parseFileToRows(
  buffer: Buffer,
  originalFilename: string,
): ParsedImportFile {
  const extension = extname(originalFilename).toLowerCase();
  const rows =
    extension === '.csv'
      ? parseCsv(buffer)
      : extension === '.xlsx' || extension === '.xls'
        ? parseWorkbook(buffer)
        : invalid('Unsupported import file type');

  const pickedRows = rows.map(pickImportColumns);
  enforceLimits(buffer, pickedRows);
  return { rows: pickedRows, totalRows: pickedRows.length };
}
