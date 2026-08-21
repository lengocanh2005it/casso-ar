import { maskApiKey } from './mask-api-key';

describe('maskApiKey', () => {
  it('keeps the last 4 characters and masks the rest', () => {
    expect(maskApiKey('AK_CS.abcd1234')).toBe('••••1234');
  });

  it('fully masks a key no longer than 4 characters', () => {
    expect(maskApiKey('abc')).toBe('••••');
    expect(maskApiKey('abcd')).toBe('••••');
  });
});
