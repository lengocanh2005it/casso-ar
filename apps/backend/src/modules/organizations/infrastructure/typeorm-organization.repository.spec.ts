import { QueryFailedError } from 'typeorm';
import { ErrorCode } from '../../../common/errors/error-code';
import { DUPLICATE_TAX_CODE } from '../application/organization-repository.port';
import { Organization } from '../domain/organization';
import { TypeOrmOrganizationRepository } from './typeorm-organization.repository';

const PROPS = {
  id: 'org-1',
  name: 'Acme Co',
  status: 'PENDING_REVIEW' as const,
  taxCode: '0101234567',
  taxCodeMatched: false,
  taxCodeLookupName: null,
  createdAt: new Date('2026-08-01'),
};

describe('TypeOrmOrganizationRepository', () => {
  it('converts a tax-code unique violation into a CONFLICT AppError', async () => {
    const ormRepo = {
      save: jest.fn().mockRejectedValue(
        new QueryFailedError(
          'INSERT ...',
          [],
          Object.assign(new Error('duplicate key'), {
            code: '23505',
            constraint: 'UQ_organizations_tax_code',
          }),
        ),
      ),
    };
    const repo = new TypeOrmOrganizationRepository(ormRepo as any);

    await expect(repo.save(new Organization(PROPS))).rejects.toMatchObject({
      errorCode: ErrorCode.CONFLICT,
      details: { rowErrorCode: DUPLICATE_TAX_CODE },
    });
  });

  it('rethrows unique violations on a different constraint unchanged', async () => {
    const dbError = new QueryFailedError(
      'INSERT ...',
      [],
      Object.assign(new Error('duplicate key'), {
        code: '23505',
        constraint: 'UQ_other_thing',
      }),
    );
    const ormRepo = { save: jest.fn().mockRejectedValue(dbError) };
    const repo = new TypeOrmOrganizationRepository(ormRepo as any);

    await expect(repo.save(new Organization(PROPS))).rejects.toBe(dbError);
  });
});
