export enum InvoiceStatus {
  DRAFT = 'DRAFT',
  ISSUED = 'ISSUED',
  CANCELLED = 'CANCELLED',
}

export type InvoiceSourceType = 'MANUAL' | 'IMPORT' | 'API' | 'ERP';
