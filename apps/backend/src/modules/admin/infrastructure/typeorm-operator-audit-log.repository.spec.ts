import { OperatorAuditLog } from '../domain/operator-audit-log';
import { TypeOrmOperatorAuditLogRepository } from './typeorm-operator-audit-log.repository';

describe('TypeOrmOperatorAuditLogRepository', () => {
  it('persists membershipId when saving a MEMBER_BLOCKED entry', async () => {
    const repo = { save: jest.fn() };
    const repository = new TypeOrmOperatorAuditLogRepository(repo as any);

    await repository.save(
      new OperatorAuditLog({
        id: 'log-1',
        operatorId: 'op-1',
        organizationId: 'org-1',
        actionType: 'MEMBER_BLOCKED',
        membershipId: 'mem-1',
        createdAt: new Date('2026-08-01'),
      }),
    );

    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'log-1',
        operatorId: 'op-1',
        organizationId: 'org-1',
        actionType: 'MEMBER_BLOCKED',
        membershipId: 'mem-1',
      }),
    );
  });

  it('persists membershipId as null for an org-level action', async () => {
    const repo = { save: jest.fn() };
    const repository = new TypeOrmOperatorAuditLogRepository(repo as any);

    await repository.save(
      new OperatorAuditLog({
        id: 'log-2',
        operatorId: 'op-1',
        organizationId: 'org-1',
        actionType: 'ORGANIZATION_LOCKED',
        createdAt: new Date('2026-08-01'),
      }),
    );

    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ membershipId: null }),
    );
  });

  it('persists inviteId while keeping membershipId nullable', async () => {
    const repo = { save: jest.fn() };
    const repository = new TypeOrmOperatorAuditLogRepository(repo as any);

    await repository.save(
      new OperatorAuditLog({
        id: 'log-3',
        operatorId: 'op-1',
        organizationId: 'org-1',
        actionType: 'INVITE_RESENT' as any,
        inviteId: 'invite-1',
        createdAt: new Date('2026-08-01'),
      } as any),
    );

    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        inviteId: 'invite-1',
        membershipId: null,
      }),
    );
  });
});
