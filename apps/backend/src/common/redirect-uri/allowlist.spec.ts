import { isRedirectUriAllowed, parseRedirectUriAllowlist } from './allowlist';

describe('parseRedirectUriAllowlist', () => {
  it('parses comma-separated origins, trimming and dropping empties', () => {
    expect(parseRedirectUriAllowlist(' https://a.vn , ,https://b.vn ')).toEqual(
      ['https://a.vn', 'https://b.vn'],
    );
  });

  it('returns an empty list for undefined or empty input', () => {
    expect(parseRedirectUriAllowlist(undefined)).toEqual([]);
    expect(parseRedirectUriAllowlist('')).toEqual([]);
    expect(parseRedirectUriAllowlist(' , ')).toEqual([]);
  });
});

describe('isRedirectUriAllowed', () => {
  it('fails closed when the allowlist is empty (unconfigured)', () => {
    expect(isRedirectUriAllowed('http://localhost:3000/callback', [])).toBe(
      false,
    );
  });

  it('accepts a path on an exactly matching configured origin', () => {
    expect(
      isRedirectUriAllowed('https://app.casso.vn/cas/callback', [
        'https://app.casso.vn',
      ]),
    ).toBe(true);
  });

  it('rejects a redirect URI outside the configured origins', () => {
    expect(
      isRedirectUriAllowed('https://evil.example/callback', [
        'https://app.casso.vn',
      ]),
    ).toBe(false);
  });

  it('does not accept an attacker origin that only shares a prefix', () => {
    expect(
      isRedirectUriAllowed('https://app.casso.vn.evil/callback', [
        'https://app.casso.vn',
      ]),
    ).toBe(false);
  });

  it('rejects a redirect URI with a different scheme or port', () => {
    expect(
      isRedirectUriAllowed('http://app.casso.vn/callback', [
        'https://app.casso.vn',
      ]),
    ).toBe(false);
    expect(
      isRedirectUriAllowed('https://app.casso.vn:8443/callback', [
        'https://app.casso.vn',
      ]),
    ).toBe(false);
  });

  it('rejects a redirect URI that is not a valid URL', () => {
    expect(isRedirectUriAllowed('not-a-url', ['https://app.casso.vn'])).toBe(
      false,
    );
    expect(isRedirectUriAllowed('', ['https://app.casso.vn'])).toBe(false);
  });

  it('normalizes a trailing slash on the configured origin', () => {
    expect(
      isRedirectUriAllowed('https://app.casso.vn/callback', [
        'https://app.casso.vn/',
      ]),
    ).toBe(true);
  });
});
