import { DataSource } from 'typeorm';
import { PendingSignup } from '../domain/pending-signup';
import { TypeOrmPendingSignupRepository } from './typeorm-pending-signup.repository';

function buildPendingSignup() {
  return new PendingSignup({
    id: 'pending-1',
    email: 'an@acme.vn',
    passwordHash: 'hashed',
    name: 'An',
    organizationName: 'Acme Co',
    taxCode: '0101234567',
    taxCodeMatched: true,
    taxCodeLookupName: 'Acme Co',
    otpHash: 'otp-hash',
    expiresAt: new Date('2026-08-24T00:10:00.000Z'),
    createdAt: new Date('2026-08-24T00:00:00.000Z'),
  });
}

describe('TypeOrmPendingSignupRepository', () => {
  it('saves a pending signup via the ORM repository', async () => {
    const save = jest.fn();
    const dataSource = {
      getRepository: jest.fn().mockReturnValue({ save }),
    } as unknown as DataSource;
    const repo = new TypeOrmPendingSignupRepository(dataSource);

    await repo.save(buildPendingSignup());

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'pending-1', email: 'an@acme.vn' }),
    );
  });

  it('findByEmail without a manager does a plain lookup', async () => {
    const findOne = jest.fn().mockResolvedValue(null);
    const dataSource = {
      getRepository: jest.fn().mockReturnValue({ findOne }),
    } as unknown as DataSource;
    const repo = new TypeOrmPendingSignupRepository(dataSource);

    const result = await repo.findByEmail('an@acme.vn');

    expect(findOne).toHaveBeenCalledWith({ where: { email: 'an@acme.vn' } });
    expect(result).toBeNull();
  });

  it('findByEmail with a manager locks the row for update', async () => {
    const getOne = jest.fn().mockResolvedValue(null);
    const where = jest.fn().mockReturnValue({ getOne });
    const setLock = jest.fn().mockReturnValue({ where });
    const createQueryBuilder = jest.fn().mockReturnValue({ setLock });
    const manager = {
      getRepository: jest.fn().mockReturnValue({ createQueryBuilder }),
    } as never;
    const dataSource = {} as DataSource;
    const repo = new TypeOrmPendingSignupRepository(dataSource);

    await repo.findByEmail('an@acme.vn', manager);

    expect(setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(where).toHaveBeenCalledWith('pendingSignup.email = :email', {
      email: 'an@acme.vn',
    });
  });

  it('delete removes the row by id', async () => {
    const del = jest.fn();
    const dataSource = {
      getRepository: jest.fn().mockReturnValue({ delete: del }),
    } as unknown as DataSource;
    const repo = new TypeOrmPendingSignupRepository(dataSource);

    await repo.delete('pending-1');

    expect(del).toHaveBeenCalledWith('pending-1');
  });
});
