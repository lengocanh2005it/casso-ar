import { ErrorCode } from '../../../common/errors/error-code';
import { decryptToken, encryptToken } from './token-encryption';

describe('token encryption', () => {
  const key =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  it('round-trips tokens and uses a random IV', () => {
    delete process.env.ACCESS_TOKEN_ENCRYPTION_KEY;
    const first = encryptToken('secret-token', key);
    const second = encryptToken('secret-token', key);

    expect(first).not.toBe(second);
    expect(decryptToken(first, key)).toBe('secret-token');
  });

  it('rejects invalid encryption keys with the token error code', () => {
    expect(() => encryptToken('secret-token', 'z'.repeat(64))).toThrow(
      expect.objectContaining({
        errorCode: ErrorCode.TOKEN_ENCRYPTION_FAILED,
      }),
    );
  });

  it('rejects a truncated or corrupt ciphertext with the token error code', () => {
    expect(() => decryptToken('bm90LWVuZ3RwX3VzZXJ0b3BhZ2U=', key)).toThrow(
      expect.objectContaining({
        errorCode: ErrorCode.TOKEN_ENCRYPTION_FAILED,
      }),
    );
  });
});
