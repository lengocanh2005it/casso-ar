import { extname } from 'node:path';
import { parse } from 'csv-parse/sync';
import { read, utils } from 'xlsx';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import type { ParsedImportFile } from '../application/import-file-row-parser.port';

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

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 1000;
const REQUIRED_HEADERS = new Set<string>(IMPORT_HEADERS);
const XLS_CFB_SIGNATURE = Buffer.from([
  0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1,
]);

const invalid = (message: string): never => {
  throw new AppError(ErrorCode.VALIDATION_ERROR, message);
};

const normalizeFirstHeader = (headers: unknown[]): string[] =>
  headers.map((header, index) => {
    if (typeof header === 'string') {
      return index === 0 ? header.replace(/^\uFEFF/, '') : header;
    }
    return invalid('Tên cột nhập phải là chuỗi');
  });

const validateHeaders = (headers: unknown[]): string[] => {
  const normalized = normalizeFirstHeader(headers);
  const seen = new Set<string>();

  for (const header of normalized) {
    if (seen.has(header)) invalid(`Cột nhập bị trùng: ${header}`);
    seen.add(header);
  }

  for (const header of IMPORT_HEADERS) {
    if (!seen.has(header)) invalid(`Thiếu cột nhập: ${header}`);
  }

  return normalized;
};

const pickImportColumns = (
  row: Record<string, unknown>,
): Record<string, unknown> =>
  Object.fromEntries(IMPORT_HEADERS.map((header) => [header, row[header]]));

const enforceLimits = (rows: Record<string, unknown>[]): void => {
  if (rows.length === 0) invalid('Tệp nhập không có dòng dữ liệu');
  if (rows.length > MAX_ROWS) invalid('Tệp nhập vượt quá 1.000 dòng');
};

// A workbook's !ref range (e.g. "A1:C5000000") declares its full extent.
// Checking it BEFORE sheet_to_json() materializes rows means a compressed
// workbook whose declared size is over the cap is rejected without ever
// expanding it into memory (zip-bomb defense).
export function declaredRowCountInRange(range: string | undefined): number {
  if (!range) return 0;
  const [start, end] = range.split(':');
  const endRow = Number((end ?? range).replace(/^[A-Za-z]+/, ''));
  if (!Number.isInteger(endRow)) return 0;
  const startRow = Number((start ?? range).replace(/^[A-Za-z]+/, ''));
  if (!Number.isInteger(startRow) || startRow < 1) return endRow;
  return Math.max(1, endRow - startRow + 1);
}

const assertDeclaredRowCountWithinLimit = (range: string | undefined): void => {
  const declaredDataRows = Math.max(0, declaredRowCountInRange(range) - 1);
  if (declaredDataRows > MAX_ROWS) {
    invalid('Tệp bảng tính vượt quá 1.000 dòng');
  }
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
    return invalid('Tệp CSV nhập không hợp lệ');
  }
};

const parseWorkbook = (
  buffer: Buffer,
  extension: '.xlsx' | '.xls',
): Record<string, unknown>[] => {
  try {
    const hasSignature =
      extension === '.xlsx'
        ? buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
        : buffer
            .subarray(0, XLS_CFB_SIGNATURE.length)
            .equals(XLS_CFB_SIGNATURE);
    if (!hasSignature) return invalid('Tệp bảng tính nhập không hợp lệ');

    const workbook = read(buffer, { cellDates: true, type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) return invalid('Tệp bảng tính không có trang tính');

    const firstSheet = workbook.Sheets[firstSheetName];
    assertDeclaredRowCountWithinLimit(firstSheet['!ref']);
    const sheetRows = utils.sheet_to_json<unknown[]>(firstSheet, {
      blankrows: false,
      defval: null,
      header: 1,
      raw: true,
    });
    const [headers, ...dataRows] = sheetRows;
    if (!headers) return invalid('Tệp bảng tính không có dòng tiêu đề');

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
    return invalid('Tệp bảng tính nhập không hợp lệ');
  }
};

export function parseFileToRows(
  buffer: Buffer,
  originalFilename: string,
): ParsedImportFile {
  if (buffer.byteLength > MAX_FILE_BYTES) {
    invalid('Tệp nhập vượt quá 5 MiB');
  }

  const extension = extname(originalFilename).toLowerCase();
  const rows =
    extension === '.csv'
      ? parseCsv(buffer)
      : extension === '.xlsx' || extension === '.xls'
        ? parseWorkbook(buffer, extension)
        : invalid('Định dạng tệp nhập không được hỗ trợ');

  const pickedRows = rows.map(pickImportColumns);
  enforceLimits(pickedRows);
  return { rows: pickedRows, totalRows: pickedRows.length };
}
