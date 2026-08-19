import { isIpAllowed, parseIpAllowlist } from './ip-allowlist';

describe('parseIpAllowlist', () => {
  it('splits a comma-separated list and trims whitespace', () => {
    expect(parseIpAllowlist(' 20.2.69.168 , 127.0.0.1')).toEqual([
      '20.2.69.168',
      '127.0.0.1',
    ]);
  });

  it('returns an empty array for undefined or empty input', () => {
    expect(parseIpAllowlist(undefined)).toEqual([]);
    expect(parseIpAllowlist('')).toEqual([]);
  });
});

describe('isIpAllowed', () => {
  it('allows an exact match', () => {
    expect(isIpAllowed('20.2.69.168', ['20.2.69.168'])).toBe(true);
  });

  it('rejects an IP not in the allowlist', () => {
    expect(isIpAllowed('1.2.3.4', ['20.2.69.168'])).toBe(false);
  });

  it('fails closed when the allowlist is empty', () => {
    expect(isIpAllowed('20.2.69.168', [])).toBe(false);
  });
});
