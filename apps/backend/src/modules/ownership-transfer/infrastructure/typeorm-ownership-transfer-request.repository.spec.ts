import { DataSource } from 'typeorm';
import { OwnershipTransferRequest } from '../domain/ownership-transfer-request';
import { TypeOrmOwnershipTransferRequestRepository } from './typeorm-ownership-transfer-request.repository';

function buildRequest() {
  return new OwnershipTransferRequest({
    id: 'req-1',
    organizationId: 'org-1',
    fromUserId: 'owner-1',
    toUserId: 'target-1',
    status: 'PENDING_OTP_CONFIRMATION',
    otpHash: 'hash-1',
    otpExpiresAt: new Date('2026-08-23T00:05:00.000Z'),
    acceptanceExpiresAt: null,
    resolvedAt: null,
    createdAt: new Date('2026-08-23T00:00:00.000Z'),
  });
}

describe('TypeOrmOwnershipTransferRequestRepository', () => {
  it('saves a request via the ORM repository', async () => {
    const save = jest.fn();
    const ormRepo = { save };
    const dataSource = {
      getRepository: jest.fn().mockReturnValue(ormRepo),
    } as unknown as DataSource;
    const repo = new TypeOrmOwnershipTransferRequestRepository(dataSource);

    await repo.save(buildRequest());

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'req-1', status: 'PENDING_OTP_CONFIRMATION' }),
    );
  });

  it('findById scopes by organizationId', async () => {
    const findOne = jest.fn().mockResolvedValue(null);
    const ormRepo = { findOne };
    const dataSource = {
      getRepository: jest.fn().mockReturnValue(ormRepo),
    } as unknown as DataSource;
    const repo = new TypeOrmOwnershipTransferRequestRepository(dataSource);

    await repo.findById('req-1', 'org-1');

    expect(findOne).toHaveBeenCalledWith({
      where: { id: 'req-1', organizationId: 'org-1' },
    });
  });
});
