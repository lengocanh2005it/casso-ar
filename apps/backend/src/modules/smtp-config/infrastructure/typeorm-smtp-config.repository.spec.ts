import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  OrganizationSmtpConfig,
  SmtpConfigStatus,
} from '../domain/organization-smtp-config';
import { TypeOrmSmtpConfigRepository } from './typeorm-smtp-config.repository';

describe('TypeOrmSmtpConfigRepository', () => {
  function buildDataSource(ormRepo: object) {
    return {
      transaction: jest.fn((callback) =>
        callback({ getRepository: () => ormRepo }),
      ),
    };
  }

  function buildTenantContext(organizationId = 'org-1') {
    return { getOrganizationId: jest.fn(() => organizationId) };
  }

  function buildOrmRow() {
    return {
      id: 'smtp-1',
      organizationId: 'org-1',
      host: 'smtp.congtyb.vn',
      port: 587,
      username: 'noreply@congtyb.vn',
      encryptedPassword: 'ciphertext',
      fromAddress: 'noreply@congtyb.vn',
      status: SmtpConfigStatus.CONNECTED,
      createdAt: new Date('2026-08-01'),
      updatedAt: new Date('2026-08-01'),
      version: 1,
    };
  }

  it('findByOrganizationId maps every ORM field to the domain entity', async () => {
    const ormRepo = { findOne: jest.fn().mockResolvedValue(buildOrmRow()) };
    const repo = new TypeOrmSmtpConfigRepository(
      ormRepo as any,
      buildDataSource(ormRepo) as any,
      buildTenantContext() as any,
    );

    const config = await repo.findByOrganizationId('org-1');

    expect(ormRepo.findOne).toHaveBeenCalledWith({
      select: {
        id: true,
        organizationId: true,
        host: true,
        port: true,
        username: true,
        encryptedPassword: true,
        fromAddress: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        version: true,
      },
      where: { organizationId: 'org-1' },
    });
    expect(config?.host).toBe('smtp.congtyb.vn');
    expect(config?.status).toBe(SmtpConfigStatus.CONNECTED);
    expect(config?.encryptedPassword).toBe('ciphertext');
    expect(config?.version).toBe(1);
  });

  it('findByOrganizationId returns null when no row exists', async () => {
    const ormRepo = { findOne: jest.fn().mockResolvedValue(null) };
    const repo = new TypeOrmSmtpConfigRepository(
      ormRepo as any,
      buildDataSource(ormRepo) as any,
      buildTenantContext() as any,
    );

    expect(await repo.findByOrganizationId('org-1')).toBeNull();
  });

  it('rejects SMTP access across organization boundaries', async () => {
    const ormRepo = { findOne: jest.fn() };
    const repo = new TypeOrmSmtpConfigRepository(
      ormRepo as any,
      buildDataSource(ormRepo) as any,
      buildTenantContext('org-1') as any,
    );

    await expect(repo.findByOrganizationId('org-2')).rejects.toThrow(AppError);
    await expect(repo.findByOrganizationId('org-2')).rejects.toMatchObject({
      errorCode: ErrorCode.TENANT_MISMATCH,
    });
  });

  it('save upserts by organizationId', async () => {
    const ormRepo = { upsert: jest.fn() };
    const repo = new TypeOrmSmtpConfigRepository(
      ormRepo as any,
      {
        transaction: jest.fn((callback) =>
          callback({ getRepository: () => ormRepo }),
        ),
      } as any,
      buildTenantContext() as any,
    );

    await repo.save(new OrganizationSmtpConfig(buildOrmRow()));

    expect(ormRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        status: SmtpConfigStatus.CONNECTED,
      }),
      ['organizationId'],
    );
  });

  it('persists SMTP status changes inside a transaction', async () => {
    const ormRepo = { upsert: jest.fn() };
    const transaction = jest.fn((callback) =>
      callback({ getRepository: () => ormRepo }),
    );
    const repo = new TypeOrmSmtpConfigRepository(
      ormRepo as any,
      {
        transaction,
      } as any,
      buildTenantContext() as any,
    );

    await repo.save(new OrganizationSmtpConfig(buildOrmRow()));

    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('marks a connected config as failed only when its version still matches', async () => {
    const execute = jest.fn().mockResolvedValue({ affected: 1 });
    const queryBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute,
    };
    const ormRepo = { createQueryBuilder: jest.fn(() => queryBuilder) };
    const repo = new TypeOrmSmtpConfigRepository(
      ormRepo as any,
      {
        transaction: jest.fn((callback) =>
          callback({ getRepository: () => ormRepo }),
        ),
      } as any,
      buildTenantContext() as any,
    );
    const failedConfig = new OrganizationSmtpConfig({
      ...buildOrmRow(),
      status: SmtpConfigStatus.FAILED,
      updatedAt: new Date('2026-08-11'),
    });

    expect(await repo.markFailedIfVersionMatches(failedConfig)).toBe(true);
    expect(queryBuilder.set).toHaveBeenCalledWith({
      status: SmtpConfigStatus.FAILED,
      updatedAt: failedConfig.updatedAt,
      version: 2,
    });
    expect(queryBuilder.where).toHaveBeenCalledWith(
      '"organizationId" = :organizationId',
      { organizationId: 'org-1' },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'status = :connected AND version = :version',
      { connected: SmtpConfigStatus.CONNECTED, version: 1 },
    );
  });

  it('returns false when another worker already transitioned the config', async () => {
    const queryBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 0 }),
    };
    const ormRepo = {
      createQueryBuilder: jest.fn(() => queryBuilder),
    };
    const repo = new TypeOrmSmtpConfigRepository(
      ormRepo as any,
      {
        transaction: jest.fn((callback) =>
          callback({ getRepository: () => ormRepo }),
        ),
      } as any,
      buildTenantContext() as any,
    );

    expect(
      await repo.markFailedIfVersionMatches(
        new OrganizationSmtpConfig({
          ...buildOrmRow(),
          status: SmtpConfigStatus.FAILED,
        }),
      ),
    ).toBe(false);
  });
});
