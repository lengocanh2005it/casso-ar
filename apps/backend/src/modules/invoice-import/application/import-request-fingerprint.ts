import { createHash } from 'node:crypto';

export function getImportRequestFingerprint(
  buffer: Buffer,
  filename: string,
): string {
  return createHash('sha256')
    .update(filename)
    .update('\0')
    .update(buffer)
    .digest('hex');
}
