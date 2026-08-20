import { generateOtp, generateToken, hashOtp, hashToken } from './token-hasher';

describe('token-hasher', () => {
  it('generates a token and its matching hash consistently', () => {
    const { token, hash } = generateToken();

    expect(token).toHaveLength(64);
    expect(hashToken(token)).toBe(hash);
  });

  it('produces different tokens on each call', () => {
    const first = generateToken();
    const second = generateToken();

    expect(first.token).not.toBe(second.token);
  });
});

describe('otp-hasher', () => {
  it('generates a 6-digit OTP and its matching hash consistently', () => {
    const { otp, hash } = generateOtp();

    expect(otp).toMatch(/^\d{6}$/);
    expect(hashOtp(otp)).toBe(hash);
  });

  it('produces different OTPs on each call', () => {
    const first = generateOtp();
    const second = generateOtp();

    expect(first.otp).not.toBe(second.otp);
  });
});
