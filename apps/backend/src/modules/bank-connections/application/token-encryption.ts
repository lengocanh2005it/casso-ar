import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const value = process.env.ACCESS_TOKEN_ENCRYPTION_KEY;
  if (!value || !/^[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(
      'ACCESS_TOKEN_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)',
    );
  }
  return Buffer.from(value, 'hex');
}

export function encryptToken(plainText: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plainText, 'utf8'),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}

export function decryptToken(value: string): string {
  const buffer = Buffer.from(value, 'base64');
  if (buffer.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('Invalid encrypted token');
  }
  const decipher = createDecipheriv(
    ALGORITHM,
    getKey(),
    buffer.subarray(0, IV_LENGTH),
  );
  decipher.setAuthTag(buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH));
  return Buffer.concat([
    decipher.update(buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH)),
    decipher.final(),
  ]).toString('utf8');
}
