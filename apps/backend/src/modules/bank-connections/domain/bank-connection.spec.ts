import { BankConnection } from './bank-connection';

function activeConnection(): BankConnection {
  return new BankConnection({
    id: 'conn-1',
    organizationId: 'org-1',
    casIdConnectionSessionId: 'session-1',
    grantId: 'grant-1',
    encryptedAccessToken: 'encrypted',
    accountIdentity: { accountNumber: '0011002233', bankName: 'Mock Bank' },
    status: 'ACTIVE',
    scopes: ['identity', 'transaction'],
    connectedAt: new Date(),
    lastSyncAt: null,
    revokedAt: null,
    createdAt: new Date(),
  });
}

describe('BankConnection', () => {
  it('supports the required connection state transitions', () => {
    const reauth = activeConnection().markRequiresReauthorization();
    expect(reauth.status).toBe('REQUIRES_REAUTHORIZATION');
    expect(reauth.isUsable()).toBe(false);

    const reconnected = reauth.reactivate({
      casIdConnectionSessionId: 'session-2',
      grantId: 'grant-2',
      encryptedAccessToken: 'encrypted-2',
      accountIdentity: { accountNumber: '0044005566', bankName: 'New Bank' },
      scopes: ['identity', 'transaction'],
    });
    expect(reconnected.status).toBe('ACTIVE');
    expect(reconnected.id).toBe('conn-1');
    expect(reconnected.isUsable()).toBe(true);

    const disconnected = reconnected.disconnect();
    expect(disconnected.status).toBe('DISCONNECTED');
    expect(disconnected.revokedAt).not.toBeNull();
  });

  it('rejects disconnecting a connection that is already disconnected', () => {
    const disconnected = activeConnection().disconnect();
    expect(() => disconnected.disconnect()).toThrow(
      'Cannot disconnect a connection that is already disconnected',
    );
  });

  it('rejects marking a non-ACTIVE connection as requiring reauthorization', () => {
    const reauth = activeConnection().markRequiresReauthorization();
    expect(() => reauth.markRequiresReauthorization()).toThrow(
      'Cannot mark connection as requiring reauthorization from status REQUIRES_REAUTHORIZATION',
    );
  });

  it('rejects reactivating a connection that is not awaiting reauthorization', () => {
    const active = activeConnection();
    expect(() =>
      active.reactivate({
        casIdConnectionSessionId: 'session-2',
        grantId: 'grant-2',
        encryptedAccessToken: 'encrypted-2',
        accountIdentity: { accountNumber: '0044005566', bankName: 'New Bank' },
        scopes: ['identity', 'transaction'],
      }),
    ).toThrow('Cannot reactivate a connection in status ACTIVE');
  });

  it('marks an ACTIVE connection as ERROR on a non-authentication failure', () => {
    const errored = activeConnection().markError();
    expect(errored.status).toBe('ERROR');
    expect(errored.isUsable()).toBe(false);
  });

  it('rejects marking a non-ACTIVE connection as ERROR', () => {
    const errored = activeConnection().markError();
    expect(() => errored.markError()).toThrow(
      'Cannot mark connection as ERROR from status ERROR',
    );
  });

  it('reactivates a connection that was marked ERROR', () => {
    const errored = activeConnection().markError();
    const reconnected = errored.reactivate({
      casIdConnectionSessionId: 'session-2',
      grantId: 'grant-2',
      encryptedAccessToken: 'encrypted-2',
      accountIdentity: { accountNumber: '0044005566', bankName: 'New Bank' },
      scopes: ['identity', 'transaction'],
    });
    expect(reconnected.status).toBe('ACTIVE');
  });

  it('overwrites grantId on reactivate — grantId belongs to the current grant session, not the connection', () => {
    const reauth = activeConnection().markRequiresReauthorization();
    const reconnected = reauth.reactivate({
      casIdConnectionSessionId: 'session-2',
      encryptedAccessToken: 'encrypted-2',
      accountIdentity: { accountNumber: '0044005566', bankName: 'New Bank' },
      scopes: ['identity', 'transaction'],
      grantId: 'grant-2',
    });
    expect(reconnected.grantId).toBe('grant-2');
  });
});
