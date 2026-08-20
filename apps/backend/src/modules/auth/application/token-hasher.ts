import { createHash, randomBytes, randomInt } from 'node:crypto';

export function generateToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('hex');
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function hashOtp(otp: string): string {
  return createHash('sha256').update(otp).digest('hex');
}

export function generateOtp(): { otp: string; hash: string } {
  const otp = String(randomInt(100000, 999999));
  return { otp, hash: hashOtp(otp) };
}
