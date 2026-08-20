import { CassoFlowAuthorization } from './casso-flow-authorization';

function buildAuthorization(
  overrides: Partial<
    ConstructorParameters<typeof CassoFlowAuthorization>[0]
  > = {},
): CassoFlowAuthorization {
  return new CassoFlowAuthorization({
    id: 'auth-1',
    organizationId: 'org-1',
    businessId: null,
    encryptedApiKey: 'encrypted-old-key',
    encryptedSecureToken: 'encrypted-old-secret',
    createdAt: new Date('2026-01-01'),
    ...overrides,
  });
}

describe('CassoFlowAuthorization', () => {
  it('rotate() replaces businessId, the API Key, and the webhook secret', () => {
    const authorization = buildAuthorization({ businessId: null });

    const rotated = authorization.rotate({
      businessId: 'biz-123',
      encryptedApiKey: 'encrypted-new-key',
      encryptedSecureToken: 'encrypted-new-secret',
    });

    expect(rotated.businessId).toBe('biz-123');
    expect(rotated.encryptedApiKey).toBe('encrypted-new-key');
    expect(rotated.encryptedSecureToken).toBe('encrypted-new-secret');
    expect(rotated.id).toBe('auth-1');
    expect(rotated.organizationId).toBe('org-1');
  });

  it('rotate() overwrites an existing businessId with a new one', () => {
    const authorization = buildAuthorization({ businessId: 'biz-old' });

    const rotated = authorization.rotate({
      businessId: 'biz-old',
      encryptedApiKey: 'encrypted-new-key',
      encryptedSecureToken: 'encrypted-new-secret',
    });

    expect(rotated.businessId).toBe('biz-old');
  });
});
