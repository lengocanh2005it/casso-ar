import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { Role } from '../../organizations/domain/membership';
import { Payment } from '../domain/payment';
import { TypeOrmPaymentRepository } from './typeorm-payment.repository';

const PROPS = {
  id: 'pay-1',
  organizationId: 'org-1',
  customerId: 'cus-1',
  bankTransactionId: 'btx-1',
  totalAmount: 1_000_000,
  allocatedAmount: 250_000,
  payerName: 'Acme Co',
  receivedAt: new Date('2026-08-01'),
  createdAt: new Date('2026-08-01'),
};

describe('TypeOrmPaymentRepository', () => {
  it('maps a domain Payment to a plain ORM entity', async () => {
    const ormRepo = { save: jest.fn().mockResolvedValue(undefined) };
    const tenantContext = new TenantContextService();
    const repo = new TypeOrmPaymentRepository(ormRepo as any, tenantContext);

    await tenantContext.run(
      { userId: 'u1', organizationId: 'org-1', role: Role.OWNER },
      () => repo.save(new Payment(PROPS)),
    );

    expect(ormRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'pay-1',
        organizationId: 'org-1',
        allocatedAmount: 250_000,
      }),
    );
    const saved = ormRepo.save.mock.calls[0][0];
    expect(saved).not.toBeInstanceOf(Payment);
  });
});
