import { In } from 'typeorm';
import { TypeOrmBankConnectionRepository } from './typeorm-bank-connection.repository';

describe('TypeOrmBankConnectionRepository', () => {
  describe('findActiveOrReauthorizableByOrganizationForUpdate', () => {
    it('excludes DISCONNECTED connections from the locked lookup', async () => {
      const findOne = jest.fn().mockResolvedValue(null);
      const manager = { findOne } as never;
      const repo = new TypeOrmBankConnectionRepository(
        {} as never,
        {} as never,
      );

      await repo.findActiveOrReauthorizableByOrganizationForUpdate(
        'org-1',
        manager,
      );

      expect(findOne).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          where: {
            organizationId: 'org-1',
            status: In(['ACTIVE', 'REQUIRES_REAUTHORIZATION', 'ERROR']),
          },
        }),
      );
    });
  });
});
