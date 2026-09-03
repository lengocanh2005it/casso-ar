import type { EntityManager } from 'typeorm';
import type { ICustomerRepository } from '../../customers/application/customer-repository.port';
import type { IInvoiceRepository } from '../../invoices/application/invoice-repository.port';
import type { IReceivableRepository } from '../../receivables/application/receivable-repository.port';

export const PENDING_ACTION_EXPIRY_MINUTES = 10;

export type CopilotPendingActionStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'CANCELLED'
  | 'EXPIRED';

export interface SendReminderEmailPayload {
  draftId: string;
  receivableId: string;
  customerName?: string | null;
  invoiceNumber?: string | null;
}

export async function enrichSendReminderEmailPayload(
  payload: SendReminderEmailPayload,
  organizationId: string,
  receivableRepo: IReceivableRepository | undefined,
  customerRepo: ICustomerRepository | undefined,
  invoiceRepo: IInvoiceRepository | undefined,
): Promise<SendReminderEmailPayload> {
  if (!receivableRepo || !customerRepo || !invoiceRepo) {
    return payload;
  }

  const receivable = await receivableRepo.findById(payload.receivableId);
  if (!receivable || receivable.organizationId !== organizationId) {
    return payload;
  }

  const [customer, invoice] = await Promise.all([
    customerRepo.findById(receivable.customerId),
    receivable.invoiceId
      ? invoiceRepo.findById(receivable.invoiceId)
      : Promise.resolve(null),
  ]);

  const customerName =
    customer?.organizationId === organizationId ? customer.name : null;
  const invoiceNumber =
    invoice?.organizationId === organizationId ? invoice.invoiceNumber : null;
  return {
    ...payload,
    ...(customerName ? { customerName } : {}),
    ...(invoiceNumber ? { invoiceNumber } : {}),
  };
}

export interface CopilotPendingAction {
  id: string;
  organizationId: string;
  conversationId: string;
  actionType: 'SEND_REMINDER_EMAIL';
  payload: SendReminderEmailPayload;
  status: CopilotPendingActionStatus;
  createdAt: Date;
  resolvedAt: Date | null;
  resolvedByUserId: string | null;
}

export interface ICopilotPendingActionRepository {
  create(
    conversationId: string,
    payload: SendReminderEmailPayload,
    manager?: EntityManager,
  ): Promise<CopilotPendingAction>;
  findById(id: string): Promise<CopilotPendingAction | null>;
  markExpired(id: string): Promise<void>;
  confirmIfPending(
    id: string,
    resolvedByUserId: string,
  ): Promise<CopilotPendingAction | null>;
  cancelIfPending(
    id: string,
    resolvedByUserId: string,
  ): Promise<CopilotPendingAction | null>;
  findLatestForDraftIds(
    draftIds: string[],
    manager?: EntityManager,
  ): Promise<Map<string, CopilotPendingAction>>;
}

export const COPILOT_PENDING_ACTION_REPOSITORY = Symbol(
  'COPILOT_PENDING_ACTION_REPOSITORY',
);
