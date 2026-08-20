import { TypeOrmCassoFlowAuthorizationRepository } from './typeorm-casso-flow-authorization.repository';

describe('TypeOrmCassoFlowAuthorizationRepository', () => {
  describe('findByIdUnscoped', () => {
    it('looks up by id with no organization filter', async () => {
      const findOne = jest.fn().mockResolvedValue(null);
      const ormRepo = { findOne } as never;
      const repo = new TypeOrmCassoFlowAuthorizationRepository(
        ormRepo,
        {} as never,
      );

      await repo.findByIdUnscoped('auth-1');

      expect(findOne).toHaveBeenCalledWith({ where: { id: 'auth-1' } });
    });
  });

  describe('findByIdForUpdate', () => {
    it('locks by id scoped to the current organization', async () => {
      const findOne = jest.fn().mockResolvedValue(null);
      const manager = { findOne } as never;
      const tenantContext = { getOrganizationId: () => 'org-1' };
      const repo = new TypeOrmCassoFlowAuthorizationRepository(
        {} as never,
        tenantContext as never,
      );

      await repo.findByIdForUpdate('auth-1', manager);

      expect(findOne).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          where: { id: 'auth-1', organizationId: 'org-1' },
          lock: { mode: 'pessimistic_write' },
        }),
      );
    });
  });

  describe('findById', () => {
    it('looks up by id scoped to the current organization', async () => {
      const findOne = jest.fn().mockResolvedValue(null);
      const ormRepo = { findOne } as never;
      const tenantContext = { getOrganizationId: () => 'org-1' };
      const repo = new TypeOrmCassoFlowAuthorizationRepository(
        ormRepo,
        tenantContext as never,
      );

      await repo.findById('auth-1');

      expect(findOne).toHaveBeenCalledWith({
        where: { id: 'auth-1', organizationId: 'org-1' },
      });
    });
  });

  describe('findByBusinessIdForOrganization', () => {
    it('looks up by businessId scoped to the given organization', async () => {
      const findOne = jest.fn().mockResolvedValue(null);
      const ormRepo = { findOne } as never;
      const repo = new TypeOrmCassoFlowAuthorizationRepository(
        ormRepo,
        {} as never,
      );

      await repo.findByBusinessIdForOrganization('biz-1', 'org-1');

      expect(findOne).toHaveBeenCalledWith({
        where: { businessId: 'biz-1', organizationId: 'org-1' },
      });
    });
  });
});
