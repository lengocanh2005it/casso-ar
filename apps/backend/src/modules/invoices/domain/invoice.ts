export enum InvoiceStatus {
  DRAFT = 'DRAFT',
  ISSUED = 'ISSUED',
  CANCELLED = 'CANCELLED',
}

export type InvoiceSourceType = 'MANUAL' | 'IMPORT' | 'API' | 'ERP';

export interface InvoiceProps {
  id: string;
  organizationId: string;
  customerId: string;
  invoiceNumber: string;
  issueDate: Date;
  totalAmount: number;
  taxAmount: number;
  sourceType: InvoiceSourceType;
  fileUrl: string | null;
  status: InvoiceStatus;
  createdAt: Date;
}

export class Invoice {
  readonly id: string;
  readonly organizationId: string;
  readonly customerId: string;
  readonly invoiceNumber: string;
  readonly issueDate: Date;
  readonly totalAmount: number;
  readonly taxAmount: number;
  readonly sourceType: InvoiceSourceType;
  readonly fileUrl: string | null;
  readonly status: InvoiceStatus;
  readonly createdAt: Date;

  constructor(props: InvoiceProps) {
    this.id = props.id;
    this.organizationId = props.organizationId;
    this.customerId = props.customerId;
    this.invoiceNumber = props.invoiceNumber;
    this.issueDate = props.issueDate;
    this.totalAmount = props.totalAmount;
    this.taxAmount = props.taxAmount;
    this.sourceType = props.sourceType;
    this.fileUrl = props.fileUrl;
    this.status = props.status;
    this.createdAt = props.createdAt;
  }
}
