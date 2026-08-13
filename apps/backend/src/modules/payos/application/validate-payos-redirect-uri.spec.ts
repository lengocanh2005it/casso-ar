import {
  isPayosRedirectUriAllowed,
  parsePayosRedirectUriAllowlist,
} from './validate-payos-redirect-uri';

describe('parsePayosRedirectUriAllowlist', () => {
  it('splits a comma-separated list and trims whitespace', () => {
    expect(
      parsePayosRedirectUriAllowlist('https://a.com, https://b.com'),
    ).toEqual(['https://a.com', 'https://b.com']);
  });

  it('returns an empty array for undefined', () => {
    expect(parsePayosRedirectUriAllowlist(undefined)).toEqual([]);
  });
});

describe('isPayosRedirectUriAllowed', () => {
  it('allows any URI when the allowlist is empty', () => {
    expect(isPayosRedirectUriAllowed('https://anything.com/x', [])).toBe(true);
  });

  it('allows a URI whose origin matches an allowlisted origin', () => {
    expect(
      isPayosRedirectUriAllowed('https://app.casso.vn/billing?x=1', [
        'https://app.casso.vn',
      ]),
    ).toBe(true);
  });

  it('rejects a URI whose origin is not in the allowlist', () => {
    expect(
      isPayosRedirectUriAllowed('https://evil.com/phish', [
        'https://app.casso.vn',
      ]),
    ).toBe(false);
  });

  it('rejects an unparseable URI', () => {
    expect(
      isPayosRedirectUriAllowed('not-a-url', ['https://app.casso.vn']),
    ).toBe(false);
  });
});
