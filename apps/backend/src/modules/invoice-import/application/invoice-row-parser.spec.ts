import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { parseInvoiceRow } from './invoice-row-parser';

const validRow = {
  customerName: '  Nguyen Van A  ',
  customerTaxCode: '  0101234567  ',
  customerEmail: '  CUSTOMER@EXAMPLE.COM  ',
  invoiceNumber: '  INV-001  ',
  issueDate: '2026-02-28',
  dueDate: '2026-03-28',
  totalAmount: 1000,
  taxAmount: 100,
};

describe('parseInvoiceRow', () => {
  it('parses a valid row with numeric amount and tax', () => {
    expect(parseInvoiceRow(validRow)).toEqual({
      customerName: 'Nguyen Van A',
      customerTaxCode: '0101234567',
      customerEmail: 'customer@example.com',
      invoiceNumber: 'INV-001',
      issueDate: new Date('2026-02-28T00:00:00.000Z'),
      dueDate: new Date('2026-03-28T00:00:00.000Z'),
      totalAmount: 1000,
      taxAmount: 100,
    });
  });

  it('parses digit-string amount and tax', () => {
    expect(
      parseInvoiceRow({ ...validRow, totalAmount: ' 1000 ', taxAmount: '100' })
        .totalAmount,
    ).toBe(1000);
    expect(
      parseInvoiceRow({ ...validRow, totalAmount: ' 1000 ', taxAmount: '100' })
        .taxAmount,
    ).toBe(100);
  });

  it('turns blank optional identifiers and tax into null, null, and zero', () => {
    expect(
      parseInvoiceRow({
        ...validRow,
        customerTaxCode: ' ',
        customerEmail: null,
        taxAmount: '',
      }),
    ).toMatchObject({
      customerTaxCode: null,
      customerEmail: null,
      taxAmount: 0,
    });
  });

  it.each([
    ['customerName', undefined],
    ['customerName', ' '],
    ['invoiceNumber', undefined],
    ['invoiceNumber', ' '],
  ])('rejects a missing or blank %s', (field, value) => {
    expect(() => parseInvoiceRow({ ...validRow, [field]: value })).toThrow(
      AppError,
    );
  });

  it.each([
    undefined,
    null,
    '',
    ' ',
    0,
    -1,
    1.5,
    '1,000',
    '₫1000',
    '1e3',
    Number.MAX_SAFE_INTEGER + 1,
  ])('rejects invalid totalAmount %p', (totalAmount) =>
    expect(() => parseInvoiceRow({ ...validRow, totalAmount })).toThrow(
      AppError,
    ),
  );

  it.each([-1, 1.5, '1,000', '₫1000', '1e3'])(
    'rejects invalid taxAmount %p',
    (taxAmount) => {
      expect(() => parseInvoiceRow({ ...validRow, taxAmount })).toThrow(
        AppError,
      );
    },
  );

  it('rejects tax greater than total', () => {
    expect(() =>
      parseInvoiceRow({ ...validRow, totalAmount: '1000', taxAmount: '1001' }),
    ).toThrow('taxAmount phải nằm trong khoảng từ 0 đến totalAmount');
  });

  it('accepts valid JavaScript Date cells', () => {
    const parsed = parseInvoiceRow({
      ...validRow,
      issueDate: new Date('2026-02-28T12:00:00.000Z'),
    });
    expect(parsed.issueDate).toEqual(new Date('2026-02-28T12:00:00.000Z'));
  });

  it('trims date strings before parsing', () => {
    const parsed = parseInvoiceRow({
      ...validRow,
      issueDate: ' 2026-02-28 ',
      dueDate: ' 2026-03-28 ',
    });
    expect(parsed.issueDate).toEqual(new Date('2026-02-28T00:00:00.000Z'));
    expect(parsed.dueDate).toEqual(new Date('2026-03-28T00:00:00.000Z'));
  });

  it('preserves four-digit ISO years below 100', () => {
    const parsed = parseInvoiceRow({
      ...validRow,
      issueDate: '0099-01-01',
      dueDate: '0099-01-02',
    });
    expect(parsed.issueDate.getUTCFullYear()).toBe(99);
    expect(parsed.dueDate.getUTCFullYear()).toBe(99);
  });

  it('rejects an invalid JavaScript Date cell', () => {
    expect(() =>
      parseInvoiceRow({ ...validRow, issueDate: new Date('invalid') }),
    ).toThrow(AppError);
  });

  it.each(['2026-02-29', '2026-2-28', '2026-02-28T00:00:00Z', 'not-a-date'])(
    'rejects invalid date %s',
    (issueDate) => {
      expect(() => parseInvoiceRow({ ...validRow, issueDate })).toThrow(
        AppError,
      );
    },
  );

  it('rejects dueDate before issueDate', () => {
    expect(() =>
      parseInvoiceRow({
        ...validRow,
        issueDate: '2026-03-02',
        dueDate: '2026-03-01',
      }),
    ).toThrow('dueDate phải cùng ngày hoặc sau issueDate');
  });

  it('uses the validation error code', () => {
    expect(() => parseInvoiceRow({ ...validRow, customerName: '' })).toThrow(
      expect.objectContaining({ errorCode: ErrorCode.VALIDATION_ERROR }),
    );
  });
});
