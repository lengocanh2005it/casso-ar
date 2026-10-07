import { assertLocalDatabaseHost, assertNotProduction } from './seed-guard';

describe('assertNotProduction', () => {
  it('throws when NODE_ENV is production', () => {
    expect(() => assertNotProduction('production')).toThrow(
      /refuses to run.*production/i,
    );
  });

  it('does not throw for development', () => {
    expect(() => assertNotProduction('development')).not.toThrow();
  });

  it('does not throw when NODE_ENV is unset', () => {
    expect(() => assertNotProduction(undefined)).not.toThrow();
  });
});

describe('assertLocalDatabaseHost', () => {
  it.each(['localhost', '127.0.0.1', '::1'])(
    'allows loopback host %s',
    (host) => {
      expect(() => assertLocalDatabaseHost(host)).not.toThrow();
    },
  );

  it.each(['db.example.com', 'postgres', undefined])(
    'rejects non-local host %s',
    (host) => {
      expect(() => assertLocalDatabaseHost(host)).toThrow(
        /local database host/i,
      );
    },
  );
});
