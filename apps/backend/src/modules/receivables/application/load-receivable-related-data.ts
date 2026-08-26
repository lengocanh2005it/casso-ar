import type { ICustomerRepository } from '../../customers/application/customer-repository.port';
import type { IInvoiceRepository } from '../../invoices/application/invoice-repository.port';
import type { Receivable } from '../domain/receivable';

export interface ReceivableRelatedData {
  customers: Awaited<ReturnType<ICustomerRepository['findByIds']>>;
  invoices: Awaited<ReturnType<IInvoiceRepository['findByIds']>>;
}

export async function loadReceivableRelatedData(
  receivables: Receivable[],
  customerIds: string[],
  customerRepo: ICustomerRepository,
  invoiceRepo: IInvoiceRepository,
): Promise<ReceivableRelatedData> {
  const invoiceIds = [
    ...new Set(
      receivables.flatMap((receivable) =>
        receivable.invoiceId ? [receivable.invoiceId] : [],
      ),
    ),
  ];

  const [customers, invoices] = await Promise.all([
    customerRepo.findByIds([...new Set(customerIds)]),
    invoiceRepo.findByIds(invoiceIds),
  ]);

  return { customers, invoices };
}
