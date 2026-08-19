import { CasIdUnauthorizedError } from '../application/cas-id-integration-adapter.port';
import { MockCasIdAdapter } from './mock-cas-id.adapter';

describe('MockCasIdAdapter', () => {
  it('creates a grant token with a 30-minute expiry', async () => {
    const before = Date.now();
    const result = await new MockCasIdAdapter().createGrantToken(
      [],
      'http://localhost/callback',
    );
    expect(result.grantToken).toContain('mock-grant-token-');
    expect(result.expiresAt.getTime()).toBeGreaterThan(before + 29 * 60 * 1000);
  });

  it('exchanges and resolves a mock token, including a grantId', async () => {
    const adapter = new MockCasIdAdapter();
    const { accessToken, grantId } =
      await adapter.exchangeToken('public-token');
    expect(accessToken).toContain('mock-access-token-');
    expect(grantId).toContain('mock-grant-id-');
    await expect(adapter.getAccountIdentity(accessToken)).resolves.toEqual(
      expect.objectContaining({ bankName: 'Mock Bank' }),
    );
  });

  it('simulates revoked credentials', async () => {
    await expect(
      new MockCasIdAdapter().getTransactions('revoked-token'),
    ).rejects.toThrow(CasIdUnauthorizedError);
  });
});
