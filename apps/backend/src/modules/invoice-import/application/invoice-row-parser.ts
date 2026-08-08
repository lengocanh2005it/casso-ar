import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';

export interface ParsedInvoiceRow {
  customerName: string;
  customerTaxCode: string | null;
  customerEmail: string | null;
  invoiceNumber: string;
  issueDate: Date;
  dueDate: Date;
  totalAmount: number;
  taxAmount: number;
}

const invalid = (message: string): never => {
  throw new AppError(ErrorCode.VALIDATION_ERROR, message);
};

const requiredText = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || value.trim() === '') {
    return invalid(`${field} is required`);
  }
  return value.trim();
};

const optionalText = (value: unknown): string | null => {
  if (
    value === null ||
    value === undefined ||
    (typeof value === 'string' && value.trim() === '')
  ) {
    return null;
  }
  if (typeof value !== 'string') {
    return invalid('optional identifier must be a string');
  }
  return value.trim();
};

const parseDate = (value: unknown, field: string): Date => {
  if (value instanceof Date) {
    if (!Number.isNaN(value.getTime())) return value;
    return invalid(`${field} must be a valid date`);
  }
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return invalid(`${field} must be a valid date`);
  }
  const [year, month, day] = value.split('-').map(Number);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return invalid(`${field} must be a valid date`);
  }
  return date;
};

const parseAmount = (
  value: unknown,
  field: string,
  blankIsZero = false,
): number => {
  if (
    blankIsZero &&
    (value === null ||
      value === undefined ||
      (typeof value === 'string' && value.trim() === ''))
  ) {
    return 0;
  }
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const amount = Number(value.trim());
    if (Number.isSafeInteger(amount)) return amount;
  }
  return invalid(`${field} must be a safe integer`);
};

export function parseInvoiceRow(
  row: Record<string, unknown>,
): ParsedInvoiceRow {
  const totalAmount = parseAmount(row.totalAmount, 'totalAmount');
  if (totalAmount <= 0) invalid('totalAmount must be greater than 0');

  const taxAmount = parseAmount(row.taxAmount, 'taxAmount', true);
  if (taxAmount < 0 || taxAmount > totalAmount)
    invalid('taxAmount must be between 0 and totalAmount');

  const issueDate = parseDate(row.issueDate, 'issueDate');
  const dueDate = parseDate(row.dueDate, 'dueDate');
  if (dueDate < issueDate) invalid('dueDate must be on or after issueDate');

  return {
    customerName: requiredText(row.customerName, 'customerName'),
    customerTaxCode: optionalText(row.customerTaxCode),
    customerEmail: optionalText(row.customerEmail)?.toLowerCase() ?? null,
    invoiceNumber: requiredText(row.invoiceNumber, 'invoiceNumber'),
    issueDate,
    dueDate,
    totalAmount,
    taxAmount,
  };
}
