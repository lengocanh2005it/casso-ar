import { utils, write } from 'xlsx';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  declaredRowCountInRange,
  IMPORT_HEADERS,
  parseFileToRows,
} from './file-row-parser';

const validRow: Record<string, string> = {
  customerName: 'Nguyen Van A',
  customerTaxCode: '0101234567',
  customerEmail: 'customer@example.com',
  invoiceNumber: 'INV-001',
  issueDate: '2026-02-28',
  dueDate: '2026-03-28',
  totalAmount: '1000',
  taxAmount: '100',
};

const workbookBuffer = (
  sheets: Record<string, Record<string, unknown>[]>,
  bookType: 'xlsx' | 'xls' = 'xlsx',
): Buffer => {
  const workbook = utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    utils.book_append_sheet(workbook, utils.json_to_sheet(rows), name);
  }
  return write(workbook, { bookType, type: 'buffer' }) as Buffer;
};

const csvBuffer = (
  headers: readonly string[] = IMPORT_HEADERS,
  rows: Record<string, string>[] = [validRow],
): Buffer =>
  Buffer.from(
    `\uFEFF${headers.join(',')}\n${rows
      .map((row) => headers.map((header) => row[header] ?? '').join(','))
      .join('\n')}`,
    'utf8',
  );

const expectValidationError = (act: () => unknown): void => {
  expect(act).toThrow(AppError);
  expect(act).toThrow(
    expect.objectContaining({ errorCode: ErrorCode.VALIDATION_ERROR }),
  );
};

const workbookWithDeclaredRange = (
  range: string,
  bookType: 'xlsx' | 'xls' = 'xlsx',
): Buffer => {
  const sheet = utils.aoa_to_sheet([
    [...IMPORT_HEADERS],
    Object.values(validRow),
  ]);
  sheet['!ref'] = range;
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, sheet, 'Sheet1');
  return write(workbook, { bookType, type: 'buffer' }) as Buffer;
};

describe('parseFileToRows', () => {
  it('parses .xlsx rows from the first sheet', () => {
    expect(
      parseFileToRows(workbookBuffer({ Sheet1: [validRow] }), 'invoices.xlsx'),
    ).toEqual({ rows: [validRow], totalRows: 1 });
  });

  it('parses .xls rows from the first sheet', () => {
    expect(
      parseFileToRows(
        workbookBuffer({ Sheet1: [validRow] }, 'xls'),
        'invoices.xls',
      ),
    ).toEqual({ rows: [validRow], totalRows: 1 });
  });

  it('parses CSV with UTF-8 BOM and comma delimiter', () => {
    expect(parseFileToRows(csvBuffer(), 'invoices.csv')).toEqual({
      rows: [validRow],
      totalRows: 1,
    });
  });

  it('ignores extra headers', () => {
    const headers = [...IMPORT_HEADERS, 'ignored'] as const;
    const parsed = parseFileToRows(
      workbookBuffer({ Sheet1: [{ ...validRow, ignored: 'drop me' }] }),
      'invoices.xlsx',
    );

    expect(parsed.rows).toEqual([
      Object.fromEntries(
        IMPORT_HEADERS.map((header) => [header, validRow[header]]),
      ),
    ]);
    expect(parseFileToRows(csvBuffer(headers), 'invoices.csv').rows).toEqual(
      parsed.rows,
    );
  });

  it('rejects a missing header', () => {
    expectValidationError(() =>
      parseFileToRows(csvBuffer(IMPORT_HEADERS.slice(1)), 'invoices.csv'),
    );
  });

  it('rejects a duplicate header', () => {
    expectValidationError(() =>
      parseFileToRows(
        csvBuffer([...IMPORT_HEADERS, 'customerName']),
        'invoices.csv',
      ),
    );
  });

  it('requires exact header casing', () => {
    expectValidationError(() =>
      parseFileToRows(
        csvBuffer(['CustomerName', ...IMPORT_HEADERS.slice(1)]),
        'invoices.csv',
      ),
    );
  });

  it('rejects an empty data file', () => {
    expectValidationError(() =>
      parseFileToRows(
        Buffer.from(`${IMPORT_HEADERS.join(',')}\n`),
        'invoices.csv',
      ),
    );
  });

  it('rejects an unsupported extension', () => {
    expectValidationError(() =>
      parseFileToRows(Buffer.from(''), 'invoices.txt'),
    );
  });

  it('rejects malformed workbook or CSV content', () => {
    expectValidationError(() =>
      parseFileToRows(Buffer.from('not a workbook'), 'invoices.xlsx'),
    );
    expectValidationError(() =>
      parseFileToRows(
        Buffer.from('customerName\n"unterminated'),
        'invoices.csv',
      ),
    );
  });

  it('rejects CSV bytes renamed with an .xlsx extension', () => {
    expectValidationError(() => parseFileToRows(csvBuffer(), 'invoices.xlsx'));
  });

  it('rejects CSV bytes renamed with an .xls extension', () => {
    expectValidationError(() => parseFileToRows(csvBuffer(), 'invoices.xls'));
  });

  it('rejects more than 1,000 data rows', () => {
    expectValidationError(() =>
      parseFileToRows(
        csvBuffer(
          IMPORT_HEADERS,
          Array.from({ length: 1001 }, (_, index) => ({
            ...validRow,
            invoiceNumber: `INV-${index}`,
          })),
        ),
        'invoices.csv',
      ),
    );
  });

  it('rejects files larger than 5 MiB', () => {
    expectValidationError(() =>
      parseFileToRows(Buffer.alloc(5 * 1024 * 1024 + 1), 'invoices.csv'),
    );
  });

  it('rejects oversized malformed files before parsing', () => {
    const prefix = Buffer.from('not a CSV');
    const oversized = Buffer.concat([
      prefix,
      Buffer.alloc(5 * 1024 * 1024 + 1 - prefix.length),
    ]);

    expect(() => parseFileToRows(oversized, 'invoices.csv')).toThrow(
      'Tệp nhập vượt quá 5 MiB',
    );
  });

  it('ignores a second workbook sheet', () => {
    expect(
      parseFileToRows(
        workbookBuffer({
          First: [validRow],
          Second: [{ ...validRow, invoiceNumber: 'INV-002' }],
        }),
        'invoices.xlsx',
      ),
    ).toEqual({ rows: [validRow], totalRows: 1 });
  });

  it('accepts an xlsx whose declared range fits the row budget', () => {
    expect(
      parseFileToRows(workbookWithDeclaredRange('A1:H2'), 'invoices.xlsx'),
    ).toEqual({ rows: [validRow], totalRows: 1 });
  });

  it('parses the declared row count out of a !ref range', () => {
    expect(declaredRowCountInRange('A1:H5000000')).toBe(5_000_000);
    expect(declaredRowCountInRange('A1:H2')).toBe(2);
    expect(declaredRowCountInRange('B12:C13')).toBe(2);
    expect(declaredRowCountInRange('B12:C5000000')).toBe(4_999_989);
    expect(declaredRowCountInRange(undefined)).toBe(0);
    expect(declaredRowCountInRange('garbage')).toBe(0);
  });
});
