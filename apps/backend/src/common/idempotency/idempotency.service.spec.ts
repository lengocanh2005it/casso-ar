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
