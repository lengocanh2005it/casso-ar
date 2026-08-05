import { decryptToken, encryptToken } from './token-encryption';

describe('token encryption', () => {
  beforeEach(() => {
    process.env.ACCESS_TOKEN_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  });

  it('round-trips tokens and uses a random IV', () => {
    const first = encryptToken('secret-token');
    const second = encryptToken('secret-token');

    expect(first).not.toBe(second);
    expect(decryptToken(first)).toBe('secret-token');
  });

  it('rejects invalid encryption keys', () => {
    process.env.ACCESS_TOKEN_ENCRYPTION_KEY = 'z'.repeat(64);
    expect(() => encryptToken('secret-token')).toThrow(
      '64-character hex string',
    );
  });
});
