import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import type { ICustomerRepository } from '../../customers/application/customer-repository.port';
import type { CustomerBankAccount } from '../domain/customer-bank-account';

// Create and update both need the same guard: linking a payer account that is
// already active on a *different* customer requires an explicit acknowledgement
// (issue #382, AC#3). Kept in one place so the CONFLICT shape stays identical.
export async function assertCrossCustomerLinkAcknowledged(params: {
  activeLinks: CustomerBankAccount[];
  customerId: string;
  acknowledgeExistingLinks: boolean | undefined;
  customerRepo: Pick<ICustomerRepository, 'findByIds'>;
}): Promise<void> {
  const otherCustomerIds = [
    ...new Set(
      params.activeLinks
        .filter((link) => link.customerId !== params.customerId)
        .map((link) => link.customerId),
    ),
  ];
  if (
    otherCustomerIds.length === 0 ||
    params.acknowledgeExistingLinks === true
  ) {
    return;
  }
  const names = await params.customerRepo.findByIds(otherCustomerIds);
  throw new AppError(
    ErrorCode.CONFLICT,
    'Số tài khoản này đang liên kết với khách hàng khác.',
    {
      linkedCustomerNames: otherCustomerIds
        .map((id) => names.get(id)?.name)
        .filter((name): name is string => Boolean(name)),
    },
  );
}
