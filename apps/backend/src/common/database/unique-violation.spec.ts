import { QueryFailedError } from 'typeorm';
import { isUniqueViolation } from './unique-violation';

describe('isUniqueViolation', () => {
  it('matches a Postgres unique-violation error', () => {
    const error = new QueryFailedError(
      'INSERT ...',
      [],
      Object.assign(new Error('duplicate key'), { code: '23505' }),
    );

    expect(isUniqueViolation(error)).toBe(true);
  });

  it('rejects errors with other driver codes', () => {
    const error = new QueryFailedError(
      'INSERT ...',
      [],
      Object.assign(new Error('out of range'), { code: '22003' }),
    );

    expect(isUniqueViolation(error)).toBe(false);
  });

  it('rejects non-TypeORM errors', () => {
    expect(isUniqueViolation(new Error('boom'))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation('23505')).toBe(false);
  });

  it('rejects a QueryFailedError without a driver error object', () => {
    const error = new QueryFailedError(
      'INSERT ...',
      [],
      Object.assign(new Error('plain'), {}),
    );

    expect(isUniqueViolation(error)).toBe(false);
  });
});
