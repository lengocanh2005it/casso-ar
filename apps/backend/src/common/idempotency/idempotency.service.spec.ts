import { Role } from '../../modules/organizations/domain/membership';
import { TenantContextService } from '../tenancy/tenant-context';
import { IdempotencyService } from './idempotency.service';
import { IdempotencyKeyOrmEntity } from './idempotency-key.orm-entity';

describe('IdempotencyService', () => {
  it('returns the stored response without running a repeated operation', async () => {
    let stored: Record<string, unknown> | null = null;
    const repo = {
      findOne: jest.fn().mockImplementation(async () => stored),
      save: jest.fn().mockImplementation(async (value) => {
        stored = value;
        return value;
      }),
    };
    const manager = {
      getRepository: jest.fn().mockReturnValue(repo),
      update: jest.fn().mockImplementation(async () => {
        if (stored) {
          stored = { ...stored, status: 'COMPLETED', response: { ok: true } };
        }
      }),
      delete: jest.fn(),
    };
    const dataSource = {
      transaction: jest
        .fn()
        .mockImplementation(async (callback) => callback(manager)),
    };
    const tenant = new TenantContextService();
    const service = new IdempotencyService(dataSource as any, tenant);
    const operation = jest.fn().mockResolvedValue({ ok: true });

    await tenant.run(
      { userId: 'user-1', organizationId: 'org-1', role: Role.OWNER },
      async () => {
        await expect(
          service.execute(
            'POST /receivables',
            'key-1',
            { amount: 1 },
            operation,
          ),
        ).resolves.toEqual({ ok: true });
        await expect(
          service.execute(
            'POST /receivables',
            'key-1',
            { amount: 1 },
            operation,
          ),
        ).resolves.toEqual({ ok: true });
      },
    );

    expect(operation).toHaveBeenCalledTimes(1);
    expect(dataSource.transaction).toHaveBeenCalledTimes(3);
    expect(repo).toBeDefined();
    expect(IdempotencyKeyOrmEntity).toBeDefined();
  });
});
