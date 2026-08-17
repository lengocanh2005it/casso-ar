import { assertNotProduction } from './seed-guard';

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
