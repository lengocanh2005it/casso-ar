import { Role } from '../../modules/organizations/domain/membership';
import { BaseRepository } from './base.repository';
import { TenantContextService } from './tenant-context';

class FakeRepo extends BaseRepository<{
  id: string;
  organizationId: string;
  name: string;
}> {
  findOne(where: { id: string }) {
    return this.scopedFindOne(where);
  }

  findMany() {
    return this.scopedFindMany();
  }

  save(entity: { id: string; organizationId: string; name: string }) {
    return this.scopedSaveWithManager(entity);
  }

  remove(where: { id: string }) {
    return this.scopedDelete(where);
  }
}

describe('BaseRepository', () => {
  it('injects organizationId from TenantContext into findOne where clause', async () => {
    const tenantContext = new TenantContextService();
    const ormRepo = {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: '1', organizationId: 'org-1', name: 'x' }),
    };
    const repo = new FakeRepo(ormRepo as any, tenantContext);

    await tenantContext.run(
      { userId: 'u1', organizationId: 'org-1', role: Role.OWNER },
      async () => {
        await repo.findOne({ id: '1' });
      },
    );

    expect(ormRepo.findOne).toHaveBeenCalledWith({
      where: { id: '1', organizationId: 'org-1' },
    });
  });

  it('rejects an entity whose organizationId differs from the tenant context', async () => {
    const tenantContext = new TenantContextService();
    const ormRepo = { save: jest.fn() };
    const repo = new FakeRepo(ormRepo as any, tenantContext);

    await tenantContext.run(
      { userId: 'u1', organizationId: 'org-1', role: Role.OWNER },
      async () => {
        await expect(
          repo.save({ id: '1', organizationId: 'WRONG', name: 'x' }),
        ).rejects.toThrow('TENANT_MISMATCH');
      },
    );

    expect(ormRepo.save).not.toHaveBeenCalled();
  });

  it('injects organizationId from TenantContext into findMany where clause', async () => {
    const tenantContext = new TenantContextService();
    const ormRepo = {
      find: jest
        .fn()
        .mockResolvedValue([{ id: '1', organizationId: 'org-1', name: 'x' }]),
    };
    const repo = new FakeRepo(ormRepo as any, tenantContext);

    await tenantContext.run(
      { userId: 'u1', organizationId: 'org-1', role: Role.OWNER },
      async () => {
        await repo.findMany();
      },
    );

    expect(ormRepo.find).toHaveBeenCalledWith({
      where: { organizationId: 'org-1' },
    });
  });

  it('scopes delete to the current organizationId', async () => {
    const tenantContext = new TenantContextService();
    const ormRepo = { delete: jest.fn() };
    const repo = new FakeRepo(ormRepo as any, tenantContext);

    await tenantContext.run(
      { userId: 'u1', organizationId: 'org-1', role: Role.OWNER },
      async () => {
        await repo.remove({ id: '1' });
      },
    );

    expect(ormRepo.delete).toHaveBeenCalledWith({
      id: '1',
      organizationId: 'org-1',
    });
  });
});
