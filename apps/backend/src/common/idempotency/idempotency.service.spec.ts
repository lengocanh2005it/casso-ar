import { Role } from '../../modules/organizations/domain/membership';
import { TenantContextService } from '../tenancy/tenant-context';
import { IdempotencyService } from './idempotency.service';

function canonicalize(obj: unknown): string {
  if (obj === undefined) return 'undefined';
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return `[${obj.map(canonicalize).join(',')}]`;
  }
  const sorted = Object.keys(obj).sort();
  return `{${sorted.map((k) => `${JSON.stringify(k)}:${canonicalize((obj as Record<string, unknown>)[k])}`).join(',')}}`;
}

describe('canonicalize', () => {
  it('produces identical hashes for objects with different key orders', () => {
    const a = { z: 1, a: 2, m: 3 };
    const b = { a: 2, m: 3, z: 1 };
    expect(canonicalize(a)).toBe(canonicalize(b));
  });

  it('handles nested objects', () => {
    const a = { b: { z: 1, a: 2 }, a: 1 };
    const b = { a: 1, b: { a: 2, z: 1 } };
    expect(canonicalize(a)).toBe(canonicalize(b));
  });

  it('handles arrays', () => {
    const input = [3, 1, 2];
    expect(canonicalize(input)).toBe('[3,1,2]');
  });

  it('handles primitives', () => {
    expect(canonicalize(null)).toBe('null');
    expect(canonicalize(undefined)).toBe('undefined');
    expect(canonicalize('hello')).toBe('"hello"');
    expect(canonicalize(42)).toBe('42');
    expect(canonicalize(true)).toBe('true');
  });
});

describe('IdempotencyService', () => {
  it('executes for an explicit organization without reading TenantContextService', async () => {
    const repo = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
    };
    const manager = {
      getRepository: jest.fn().mockReturnValue(repo),
      update: jest.fn(),
      delete: jest.fn(),
    };
    const dataSource = {
      transaction: jest
        .fn()
        .mockImplementation(async (callback) => callback(manager)),
    };
    const tenant = new TenantContextService();
    const getOrganizationId = jest.spyOn(tenant, 'getOrganizationId');
    const service = new IdempotencyService(dataSource as any, tenant);

    await expect(
      service.executeForOrganization(
        'org-explicit',
        'POST /admin/invites/resend',
        'key-1',
        { inviteId: 'invite-1' },
        jest.fn().mockResolvedValue({ ok: true }),
      ),
    ).resolves.toEqual({ ok: true });

    expect(getOrganizationId).not.toHaveBeenCalled();
    expect(repo.findOne).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-explicit',
        endpoint: 'POST /admin/invites/resend',
        key: 'key-1',
      },
    });
  });

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
  });

  it('does not rerun a completed void operation for the same key', async () => {
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
      update: jest.fn().mockImplementation(async (_entity, _where, update) => {
        stored = stored ? { ...stored, ...update } : stored;
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
    const operation = jest.fn().mockResolvedValue(undefined);

    await service.executeForOrganization(
      'org-1',
      'DELETE /admin/invites/invite-1',
      'key-1',
      { inviteId: 'invite-1' },
      operation,
    );
    await service.executeForOrganization(
      'org-1',
      'DELETE /admin/invites/invite-1',
      'key-1',
      { inviteId: 'invite-1' },
      operation,
    );

    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('treats same data with different key order as idempotent', async () => {
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
        await service.execute(
          'POST /receivables',
          'key-1',
          { z: 1, a: 2 },
          operation,
        );
        await service.execute(
          'POST /receivables',
          'key-1',
          { a: 2, z: 1 },
          operation,
        );
      },
    );

    expect(operation).toHaveBeenCalledTimes(1);
  });
});

describe('IdempotencyService stale PENDING reclaim (ADR-0015)', () => {
  it('rejects with CONFLICT when the PENDING row is younger than 5 minutes', async () => {
    const found = {
      id: 'key-1',
      requestHash: 'same-hash',
      status: 'PENDING',
      createdAt: new Date(Date.now() - 60_000), // 1 minute old
    };
    const repo = {
      findOne: jest.fn().mockResolvedValue(found),
      save: jest.fn(),
      delete: jest.fn(),
    };
    const manager = { getRepository: jest.fn().mockReturnValue(repo) };
    const dataSource = {
      transaction: jest
        .fn()
        .mockImplementation(async (callback) => callback(manager)),
    };
    const tenant = new TenantContextService();
    const service = new IdempotencyService(dataSource as any, tenant);
    const canonical = JSON.stringify({ amount: 1 });
    const crypto = require('node:crypto');
    found.requestHash = crypto
      .createHash('sha256')
      .update(canonical)
      .digest('hex');

    await tenant.run(
      { userId: 'user-1', organizationId: 'org-1', role: Role.OWNER },
      async () => {
        await expect(
          service.execute(
            'POST /receivables',
            'key-1',
            { amount: 1 },
            jest.fn(),
          ),
        ).rejects.toMatchObject({
          response: expect.objectContaining({ errorCode: 'CONFLICT' }),
        });
      },
    );
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it('reclaims a PENDING row older than 5 minutes and re-executes the operation', async () => {
    const found = {
      id: 'key-1',
      requestHash: '',
      status: 'PENDING',
      createdAt: new Date(Date.now() - 6 * 60_000), // 6 minutes old
    };
    const repo = {
      findOne: jest.fn().mockResolvedValue(found),
      save: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const manager = {
      getRepository: jest.fn().mockReturnValue(repo),
      update: jest.fn(),
    };
    const dataSource = {
      transaction: jest
        .fn()
        .mockImplementation(async (callback) => callback(manager)),
    };
    const tenant = new TenantContextService();
    const service = new IdempotencyService(dataSource as any, tenant);
    const canonical = JSON.stringify({ amount: 1 });
    const crypto = require('node:crypto');
    found.requestHash = crypto
      .createHash('sha256')
      .update(canonical)
      .digest('hex');
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
      },
    );

    expect(repo.delete).toHaveBeenCalledWith({ id: 'key-1' });
    expect(operation).toHaveBeenCalledTimes(1);
  });
});

describe('IdempotencyService retention deletes', () => {
  it('deleteCompletedOlderThan deletes COMPLETED rows older than cutoff', async () => {
    const deleteMock = jest.fn().mockResolvedValue({ affected: 12 });
    const dataSource = {
      getRepository: jest.fn().mockReturnValue({ delete: deleteMock }),
    };
    const service = new IdempotencyService(
      dataSource as any,
      new TenantContextService(),
    );
    const cutoff = new Date('2026-01-01T00:00:00Z');

    const result = await service.deleteCompletedOlderThan(cutoff);

    expect(deleteMock).toHaveBeenCalledWith({
      status: 'COMPLETED',
      createdAt: expect.objectContaining({ _type: 'lessThan', _value: cutoff }),
    });
    expect(result).toBe(12);
  });

  it('sweepStalePending deletes PENDING rows older than the 5-minute threshold', async () => {
    const deleteMock = jest.fn().mockResolvedValue({ affected: 3 });
    const dataSource = {
      getRepository: jest.fn().mockReturnValue({ delete: deleteMock }),
    };
    const service = new IdempotencyService(
      dataSource as any,
      new TenantContextService(),
    );

    const result = await service.sweepStalePending();

    expect(deleteMock).toHaveBeenCalledWith({
      status: 'PENDING',
      createdAt: expect.objectContaining({ _type: 'lessThan' }),
    });
    expect(result).toBe(3);
  });
});
