import { ReceivableStatus } from '@casso-ledger/shared-types';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { Receivable } from '../domain/receivable';
import { GetReceivableUseCase } from './get-receivable.usecase';

function buildReceivable(): Receivable {
  return new Receivable({
    id: 'receivable-1',
    organizationId: 'org-1',
    customerId: 'customer-1',
    invoiceId: null,
    originalAmount: 50_000_000,
    paidAmount: 0,
    dueDate: new Date('2026-08-20'),
    status: ReceivableStatus.OPEN,
    salesRepresentativeId: null,
    createdAt: new Date('2026-07-20'),
    closedAt: null,
    version: 1,
  });
}

describe('GetReceivableUseCase', () => {
  it('returns computed dispute state and the open dispute id', async () => {
    const receivable = buildReceivable();
    const receivableRepo = {
      findById: jest.fn().mockResolvedValue(receivable),
    };
    const disputeRepo = {
      findOpenDispute: jest.fn().mockResolvedValue({ id: 'dispute-1' }),
    };
    const useCase = new GetReceivableUseCase(
      receivableRepo as any,
      disputeRepo as any,
    );

    const result = await useCase.execute('receivable-1');

    expect(result).toEqual({
      receivable,
      isDisputed: true,
      disputeId: 'dispute-1',
    });
    expect(disputeRepo.findOpenDispute).toHaveBeenCalledWith('receivable-1');
  });

  it('throws a standard not-found AppError when the receivable is missing', async () => {
    const useCase = new GetReceivableUseCase(
      { findById: jest.fn().mockResolvedValue(null) } as any,
      { findOpenDispute: jest.fn() } as any,
    );

    await expect(useCase.execute('missing')).rejects.toMatchObject({
      errorCode: ErrorCode.RECEIVABLE_NOT_FOUND,
    } satisfies Partial<AppError>);
  });
});
