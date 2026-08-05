import { generateToken, hashToken } from './token-hasher';

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
