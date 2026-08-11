import { validatePublicSmtpHost } from './validate-public-smtp-host';

describe('validatePublicSmtpHost', () => {
  it.each([
    '10.0.0.1',
    '172.16.0.1',
    '192.168.1.1',
    '127.0.0.1',
    '169.254.1.1',
    '0.0.0.0',
    '::1',
    '::',
    'fc00::1',
    'fe80::1',
  ])('rejects private or local address %s', (host) => {
    expect(validatePublicSmtpHost(host, [host], [])).toBe(false);
  });

  it('rejects a hostname resolving to any private address', () => {
    expect(
      validatePublicSmtpHost('smtp.example.com', ['8.8.8.8', '10.0.0.1'], []),
    ).toBe(false);
  });

  it('allows an internal host explicitly listed in the allowlist', () => {
    expect(
      validatePublicSmtpHost(
        'smtp.internal',
        ['192.168.1.10'],
        ['smtp.internal'],
      ),
    ).toBe(true);
  });

  it('allows a hostname resolving only to public addresses', () => {
    expect(
      validatePublicSmtpHost('smtp.example.com', ['8.8.8.8', '1.1.1.1'], []),
    ).toBe(true);
  });
});
