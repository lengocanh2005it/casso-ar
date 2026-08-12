import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getKey(value: string): Buffer {
  if (!value || !/^[0-9a-fA-F]{64}$/.test(value)) {
    throw new AppError(
      ErrorCode.TOKEN_ENCRYPTION_FAILED,
      'ACCESS_TOKEN_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)',
    );
  }
  return Buffer.from(value, 'hex');
}

export function encryptToken(plainText: string, encryptionKey: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(encryptionKey), iv);
  const encrypted = Buffer.concat([
    cipher.update(plainText, 'utf8'),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}

export function decryptToken(value: string, encryptionKey: string): string {
  const buffer = Buffer.from(value, 'base64');
  if (buffer.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new AppError(
      ErrorCode.TOKEN_ENCRYPTION_FAILED,
      'Invalid encrypted token',
    );
  }
  const decipher = createDecipheriv(
    ALGORITHM,
    getKey(encryptionKey),
    buffer.subarray(0, IV_LENGTH),
  );
  decipher.setAuthTag(buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH));
  return Buffer.concat([
    decipher.update(buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH)),
    decipher.final(),
  ]).toString('utf8');
}
