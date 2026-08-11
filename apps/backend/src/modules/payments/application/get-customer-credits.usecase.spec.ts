import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { Payment } from '../domain/payment';
import { GetCustomerCreditsUseCase } from './get-customer-credits.usecase';

function buildPayment(
  id: string,
  totalAmount: number,
  allocatedAmount: number,
): Payment {
  return new Payment({
    id,
    organizationId: 'org-1',
    customerId: 'cust-1',
    bankTransactionId: `bt-${id}`,
    totalAmount,
    allocatedAmount,
    payerName: 'Công ty B',
    receivedAt: new Date('2026-08-01'),
    createdAt: new Date('2026-08-01T00:00:01Z'),
  });
}

function buildUseCase(
  customerRepo: { findById: jest.Mock },
  paymentRepo: { findUnallocatedByCustomerId: jest.Mock },
): GetCustomerCreditsUseCase {
  return new GetCustomerCreditsUseCase(customerRepo as any, paymentRepo as any);
}

describe('GetCustomerCreditsUseCase', () => {
  it('aggregates credit rows without changing Payment state', async () => {
    const payment1 = buildPayment('pay-1', 20_000_000, 15_000_000);
    const payment2 = buildPayment('pay-2', 10_000_000, 8_000_000);
    const customerRepo = {
      findById: jest.fn().mockResolvedValue({ id: 'cust-1' }),
    };
    const paymentRepo = {
      findUnallocatedByCustomerId: jest.fn().mockResolvedValue([
        { payment: payment1, unallocatedAmount: 5_000_000 },
        { payment: payment2, unallocatedAmount: 2_000_000 },
      ]),
    };
    const useCase = buildUseCase(customerRepo, paymentRepo);

    await expect(useCase.execute({ customerId: 'cust-1' })).resolves.toEqual({
      customerId: 'cust-1',
      totalAvailableAmount: 7_000_000,
      items: [
        {
          paymentId: 'pay-1',
          bankTransactionId: 'bt-pay-1',
          totalAmount: 20_000_000,
          allocatedAmount: 15_000_000,
          unallocatedAmount: 5_000_000,
          payerName: 'Công ty B',
          receivedAt: new Date('2026-08-01'),
          createdAt: new Date('2026-08-01T00:00:01Z'),
        },
        {
          paymentId: 'pay-2',
          bankTransactionId: 'bt-pay-2',
          totalAmount: 10_000_000,
          allocatedAmount: 8_000_000,
          unallocatedAmount: 2_000_000,
          payerName: 'Công ty B',
          receivedAt: new Date('2026-08-01'),
          createdAt: new Date('2026-08-01T00:00:01Z'),
        },
      ],
    });
    expect(customerRepo.findById).toHaveBeenCalledWith('cust-1');
    expect(paymentRepo.findUnallocatedByCustomerId).toHaveBeenCalledWith(
      'cust-1',
    );
    expect(payment1.allocatedAmount).toBe(15_000_000);
    expect(payment2.allocatedAmount).toBe(8_000_000);
  });

  it('returns an empty balance for a customer with no unallocated payments', async () => {
    const customerRepo = {
      findById: jest.fn().mockResolvedValue({ id: 'cust-1' }),
    };
    const paymentRepo = {
      findUnallocatedByCustomerId: jest.fn().mockResolvedValue([]),
    };
    const useCase = buildUseCase(customerRepo, paymentRepo);

    await expect(useCase.execute({ customerId: 'cust-1' })).resolves.toEqual({
      customerId: 'cust-1',
      totalAvailableAmount: 0,
      items: [],
    });
  });

  it('rejects a missing customer with a tenant-safe not-found error', async () => {
    const customerRepo = { findById: jest.fn().mockResolvedValue(null) };
    const paymentRepo = {
      findUnallocatedByCustomerId: jest.fn(),
    };
    const useCase = buildUseCase(customerRepo, paymentRepo);

    await expect(useCase.execute({ customerId: 'cust-1' })).rejects.toEqual(
      expect.objectContaining({
        errorCode: ErrorCode.NOT_FOUND,
        message: 'Không tìm thấy khách hàng.',
      }),
    );
    expect(paymentRepo.findUnallocatedByCustomerId).not.toHaveBeenCalled();
  });

  it('throws an AppError for a missing customer', async () => {
    const customerRepo = { findById: jest.fn().mockResolvedValue(null) };
    const paymentRepo = {
      findUnallocatedByCustomerId: jest.fn(),
    };
    const useCase = buildUseCase(customerRepo, paymentRepo);

    await expect(
      useCase.execute({ customerId: 'cust-1' }),
    ).rejects.toBeInstanceOf(AppError);
  });
});
