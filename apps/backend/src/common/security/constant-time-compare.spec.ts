import { equalsConstantTime } from './constant-time-compare';

describe('equalsConstantTime', () => {
  it('returns true for identical strings', () => {
    expect(equalsConstantTime('secret-123', 'secret-123')).toBe(true);
  });

  it('returns false for different strings of the same length', () => {
    expect(equalsConstantTime('secret-123', 'secret-456')).toBe(false);
  });

  it('returns false for different-length strings without throwing', () => {
    expect(equalsConstantTime('short', 'a-much-longer-string')).toBe(false);
  });
});
