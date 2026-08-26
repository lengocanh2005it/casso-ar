import { Inject, Injectable } from '@nestjs/common';
import { REMINDER_EXECUTION_REPOSITORY } from '../../../common/tokens/reminder-execution.token';
import {
  CUSTOMER_REPOSITORY,
  type ICustomerRepository,
} from '../../customers/application/customer-repository.port';
import {
  type IInvoiceRepository,
  INVOICE_REPOSITORY,
} from '../../invoices/application/invoice-repository.port';
import {
  type IReceivableRepository,
  RECEIVABLE_REPOSITORY,
} from '../../receivables/application/receivable-repository.port';
import type {
  ReminderExecution,
  ReminderExecutionStatus,
} from '../domain/reminder-execution';
import type { IReminderExecutionRepository } from './reminder-execution-repository.port';

export interface ListReminderExecutionsInput {
  receivableId?: string;
  status?: ReminderExecutionStatus;
  page: number;
  limit: number;
}

export interface ReminderExecutionView {
  execution: ReminderExecution;
  invoiceNumber: string | null;
  customerName: string | null;
}

@Injectable()
export class ListReminderExecutionsUseCase {
  constructor(
    @Inject(REMINDER_EXECUTION_REPOSITORY)
    private readonly executionRepo: IReminderExecutionRepository,
    @Inject(RECEIVABLE_REPOSITORY)
    private readonly receivableRepo: IReceivableRepository,
    @Inject(CUSTOMER_REPOSITORY)
    private readonly customerRepo: ICustomerRepository,
    @Inject(INVOICE_REPOSITORY)
    private readonly invoiceRepo: IInvoiceRepository,
  ) {}

  async execute(
    input: ListReminderExecutionsInput,
  ): Promise<{ items: ReminderExecutionView[]; total: number }> {
    const result = await this.executionRepo.findPage(input);
    if (result.items.length === 0) return { items: [], total: result.total };
    const receivables = await this.receivableRepo.findByIds([
      ...new Set(result.items.map((execution) => execution.receivableId)),
    ]);
    const customerIds = [
      ...new Set(
        [...receivables.values()].map((receivable) => receivable.customerId),
      ),
    ];
    const invoiceIds = [
      ...new Set(
        [...receivables.values()].flatMap((receivable) =>
          receivable.invoiceId ? [receivable.invoiceId] : [],
        ),
      ),
    ];
    const [customers, invoices] = await Promise.all([
      this.customerRepo.findByIds(customerIds),
      this.invoiceRepo.findByIds(invoiceIds),
    ]);

    return {
      total: result.total,
      items: result.items.map((execution) => {
        const receivable = receivables.get(execution.receivableId);
        return {
          execution,
          invoiceNumber: receivable?.invoiceId
            ? (invoices.get(receivable.invoiceId)?.invoiceNumber ?? null)
            : null,
          customerName: receivable
            ? (customers.get(receivable.customerId)?.name ?? null)
            : null,
        };
      }),
    };
  }
}
