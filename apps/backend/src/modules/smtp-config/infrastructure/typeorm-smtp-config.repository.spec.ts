import {
  OrganizationSmtpConfig,
  SmtpConfigStatus,
} from '../domain/organization-smtp-config';
import { TypeOrmSmtpConfigRepository } from './typeorm-smtp-config.repository';

describe('TypeOrmSmtpConfigRepository', () => {
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
    const repo = new TypeOrmSmtpConfigRepository(ormRepo as any);

    const config = await repo.findByOrganizationId('org-1');

    expect(ormRepo.findOne).toHaveBeenCalledWith({
      where: { organizationId: 'org-1' },
    });
    expect(config?.host).toBe('smtp.congtyb.vn');
    expect(config?.status).toBe(SmtpConfigStatus.CONNECTED);
    expect(config?.encryptedPassword).toBe('ciphertext');
    expect(config?.version).toBe(1);
  });

  it('findByOrganizationId returns null when no row exists', async () => {
    const ormRepo = { findOne: jest.fn().mockResolvedValue(null) };
    const repo = new TypeOrmSmtpConfigRepository(ormRepo as any);

    expect(await repo.findByOrganizationId('org-1')).toBeNull();
  });

  it('save upserts by organizationId', async () => {
    const ormRepo = { upsert: jest.fn() };
    const repo = new TypeOrmSmtpConfigRepository(ormRepo as any);

    await repo.save(new OrganizationSmtpConfig(buildOrmRow()));

    expect(ormRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        status: SmtpConfigStatus.CONNECTED,
      }),
      ['organizationId'],
    );
  });
});
