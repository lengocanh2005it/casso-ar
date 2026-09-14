import { ReceivableStatus } from '@casso-ar/shared-types';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { InvoiceStatus } from '../../invoices/domain/invoice';
import { Role } from '../../organizations/domain/membership';
import { Payment } from '../../payments/domain/payment';
import { Receivable } from '../domain/receivable';
import { GetReceivableUseCase } from './get-receivable.usecase';

function buildReceivable(
  salesRepresentativeId: string | null = null,
): Receivable {
  return new Receivable({
    id: 'receivable-1',
    organizationId: 'org-1',
    customerId: 'customer-1',
    invoiceId: 'invoice-1',
    originalAmount: 50_000_000,
    paidAmount: 0,
    dueDate: new Date('2099-12-31'),
    status: ReceivableStatus.OPEN,
    salesRepresentativeId,
    createdAt: new Date('2026-07-20'),
    closedAt: null,
    version: 1,
  });
}

function buildContext(role: Role, userId = 'rep-1') {
  return {
    getCurrentUser: () => ({ userId, organizationId: 'org-1', role }),
  };
}

describe('GetReceivableUseCase', () => {
  it('returns computed dispute state, the open dispute id, and active allocations', async () => {
    const receivable = buildReceivable();
    const allocations = [
      {
        id: 'alloc-1',
        paymentId: 'payment-1',
        allocatedAmount: 10_000_000,
        allocatedAt: new Date('2026-08-01'),
        allocatedByUserId: 'user-1',
      },
    ];
    const receivableRepo = {
      findById: jest.fn().mockResolvedValue(receivable),
    };
    const disputeRepo = {
      findOpenDispute: jest.fn().mockResolvedValue({ id: 'dispute-1' }),
    };
    const paymentAllocationRepo = {
      findByReceivableId: jest.fn().mockResolvedValue(allocations),
    };
    const invoiceRepo = {
      findByIds: jest.fn().mockResolvedValue(
        new Map([
          [
            'invoice-1',
            {
              id: 'invoice-1',
              invoiceNumber: 'INV-001',
              status: InvoiceStatus.ISSUED,
            },
          ],
        ]),
      ),
    };
    const customerRepo = {
      findByIds: jest.fn().mockResolvedValue(
        new Map([
          [
            'customer-1',
            {
              id: 'customer-1',
              name: 'Công ty Acme',
            },
          ],
        ]),
      ),
    };
    const paymentsById = new Map([
      [
        'payment-1',
        new Payment({
          id: 'payment-1',
          organizationId: 'org-1',
          customerId: 'customer-1',
          bankTransactionId: 'bank-transaction-1',
          totalAmount: 10_000_000,
          allocatedAmount: 10_000_000,
          payerName: 'Công ty Acme',
          receivedAt: new Date('2026-08-01'),
          createdAt: new Date('2026-08-01'),
        }),
      ],
    ]);
    const paymentRepo = {
      findByIds: jest.fn().mockResolvedValue(paymentsById),
    };
    const useCase = new GetReceivableUseCase(
      receivableRepo as any,
      disputeRepo as any,
      paymentAllocationRepo as any,
      invoiceRepo as any,
      customerRepo as any,
      paymentRepo as any,
      buildContext(Role.OWNER) as any,
    );

    const result = await useCase.execute('receivable-1');

    expect(result).toEqual({
      receivable,
      isDisputed: true,
      disputeId: 'dispute-1',
      allocations,
      invoiceNumber: 'INV-001',
      customerName: 'Công ty Acme',
      paymentsById,
      isOverdue: false,
    });
    expect(disputeRepo.findOpenDispute).toHaveBeenCalledWith('receivable-1');
    expect(paymentAllocationRepo.findByReceivableId).toHaveBeenCalledWith(
      'receivable-1',
    );
    expect(invoiceRepo.findByIds).toHaveBeenCalledWith(['invoice-1']);
    expect(customerRepo.findByIds).toHaveBeenCalledWith(['customer-1']);
    expect(paymentRepo.findByIds).toHaveBeenCalledWith(['payment-1']);
  });

  it('returns null display metadata when the referenced customer or payment is missing', async () => {
    const receivable = buildReceivable();
    const allocations = [
      {
        id: 'alloc-1',
        paymentId: 'missing-payment',
        allocatedAmount: 10_000_000,
        allocatedAt: new Date('2026-08-01'),
        allocatedByUserId: 'user-1',
      },
    ];
    const customerRepo = { findByIds: jest.fn().mockResolvedValue(new Map()) };
    const paymentRepo = { findByIds: jest.fn().mockResolvedValue(new Map()) };
    const useCase = new GetReceivableUseCase(
      { findById: jest.fn().mockResolvedValue(receivable) } as any,
      { findOpenDispute: jest.fn().mockResolvedValue(null) } as any,
      { findByReceivableId: jest.fn().mockResolvedValue(allocations) } as any,
      { findByIds: jest.fn().mockResolvedValue(new Map()) } as any,
      customerRepo as any,
      paymentRepo as any,
      buildContext(Role.OWNER) as any,
    );

    const result = await useCase.execute('receivable-1');

    expect(result.customerName).toBeNull();
    expect(result.paymentsById.get('missing-payment')).toBeUndefined();
    expect(paymentRepo.findByIds).toHaveBeenCalledWith(['missing-payment']);
  });

  it('throws a standard not-found AppError when the receivable is missing', async () => {
    const useCase = new GetReceivableUseCase(
      { findById: jest.fn().mockResolvedValue(null) } as any,
      { findOpenDispute: jest.fn() } as any,
      { findByReceivableId: jest.fn() } as any,
      { findByIds: jest.fn() } as any,
      { findByIds: jest.fn() } as any,
      { findByIds: jest.fn() } as any,
      buildContext(Role.OWNER) as any,
    );

    await expect(useCase.execute('missing')).rejects.toMatchObject({
      errorCode: ErrorCode.RECEIVABLE_NOT_FOUND,
    } satisfies Partial<AppError>);
  });

  it('hides a foreign receivable from a SALES_REP as not-found', async () => {
    const useCase = new GetReceivableUseCase(
      {
        findById: jest.fn().mockResolvedValue(buildReceivable('rep-2')),
      } as any,
      { findOpenDispute: jest.fn() } as any,
      { findByReceivableId: jest.fn() } as any,
      { findByIds: jest.fn() } as any,
      { findByIds: jest.fn() } as any,
      { findByIds: jest.fn() } as any,
      buildContext(Role.SALES_REP, 'rep-1') as any,
    );

    await expect(useCase.execute('receivable-1')).rejects.toMatchObject({
      errorCode: ErrorCode.RECEIVABLE_NOT_FOUND,
    } satisfies Partial<AppError>);
  });

  it('hides an unassigned receivable from a SALES_REP as not-found', async () => {
    const useCase = new GetReceivableUseCase(
      { findById: jest.fn().mockResolvedValue(buildReceivable(null)) } as any,
      { findOpenDispute: jest.fn() } as any,
      { findByReceivableId: jest.fn() } as any,
      { findByIds: jest.fn() } as any,
      { findByIds: jest.fn() } as any,
      { findByIds: jest.fn() } as any,
      buildContext(Role.SALES_REP, 'rep-1') as any,
    );

    await expect(useCase.execute('receivable-1')).rejects.toMatchObject({
      errorCode: ErrorCode.RECEIVABLE_NOT_FOUND,
    } satisfies Partial<AppError>);
  });

  it('returns full detail to the SALES_REP who owns the receivable', async () => {
    const receivable = buildReceivable('rep-1');
    const useCase = new GetReceivableUseCase(
      { findById: jest.fn().mockResolvedValue(receivable) } as any,
      { findOpenDispute: jest.fn().mockResolvedValue(null) } as any,
      { findByReceivableId: jest.fn().mockResolvedValue([]) } as any,
      { findByIds: jest.fn().mockResolvedValue(new Map()) } as any,
      { findByIds: jest.fn().mockResolvedValue(new Map()) } as any,
      { findByIds: jest.fn().mockResolvedValue(new Map()) } as any,
      buildContext(Role.SALES_REP, 'rep-1') as any,
    );

    const result = await useCase.execute('receivable-1');

    expect(result.receivable).toBe(receivable);
    expect(result.isDisputed).toBe(false);
  });
});
