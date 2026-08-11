import { isCasRedirectUriAllowed } from './validate-cas-redirect-uri';

describe('isCasRedirectUriAllowed', () => {
  it('rejects a redirect URI outside the configured origins', () => {
    expect(
      isCasRedirectUriAllowed('https://evil.example/callback', [
        'https://app.casso.vn',
      ]),
    ).toBe(false);
  });

  it('accepts a path on an exactly matching configured origin', () => {
    expect(
      isCasRedirectUriAllowed('https://app.casso.vn/cas/callback', [
        'https://app.casso.vn',
      ]),
    ).toBe(true);
  });

  it('does not accept an attacker origin that only shares a prefix', () => {
    expect(
      isCasRedirectUriAllowed('https://app.casso.vn.evil/callback', [
        'https://app.casso.vn',
      ]),
    ).toBe(false);
  });

  it('keeps pass-through behavior when the allowlist is empty', () => {
    expect(isCasRedirectUriAllowed('http://localhost:3000/callback', [])).toBe(
      true,
    );
  });
});
