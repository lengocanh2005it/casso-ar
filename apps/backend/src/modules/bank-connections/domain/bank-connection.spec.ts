import { BankConnection } from './bank-connection';

function buildConnection(
  overrides: Partial<ConstructorParameters<typeof BankConnection>[0]> = {},
): BankConnection {
  return new BankConnection({
    id: 'conn-1',
    organizationId: 'org-1',
    cassoFlowAuthorizationId: 'auth-1',
    accountNumber: '0011002233',
    bankName: 'Mock Bank',
    accountHolderName: 'NGUYEN VAN A',
    status: 'ACTIVE',
    connectedAt: new Date('2026-01-01'),
    lastSyncAt: null,
    revokedAt: null,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  });
}

describe('BankConnection', () => {
  describe('isUsable', () => {
    it('is usable only when ACTIVE', () => {
      expect(buildConnection({ status: 'ACTIVE' }).isUsable()).toBe(true);
      expect(buildConnection({ status: 'ERROR' }).isUsable()).toBe(false);
    });
  });

  describe('markRequiresReauthorization / markError', () => {
    it('transitions from ACTIVE to REQUIRES_REAUTHORIZATION', () => {
      const connection = buildConnection({ status: 'ACTIVE' });
      expect(connection.markRequiresReauthorization().status).toBe(
        'REQUIRES_REAUTHORIZATION',
      );
    });

    it('throws when marking a non-ACTIVE connection as requiring reauthorization', () => {
      const connection = buildConnection({ status: 'DISCONNECTED' });
      expect(() => connection.markRequiresReauthorization()).toThrow();
    });

    it('transitions from ACTIVE to ERROR', () => {
      const connection = buildConnection({ status: 'ACTIVE' });
      expect(connection.markError().status).toBe('ERROR');
    });
  });

  describe('reactivate', () => {
    it('reactivates a REQUIRES_REAUTHORIZATION connection with new account info', () => {
      const connection = buildConnection({
        status: 'REQUIRES_REAUTHORIZATION',
        accountNumber: 'old-number',
        bankName: 'Old Bank',
        accountHolderName: 'OLD NAME',
        cassoFlowAuthorizationId: 'auth-old',
      });

      const reactivated = connection.reactivate({
        accountNumber: 'new-number',
        bankName: 'New Bank',
        accountHolderName: 'NEW NAME',
        cassoFlowAuthorizationId: 'auth-new',
      });

      expect(reactivated.status).toBe('ACTIVE');
      expect(reactivated.accountNumber).toBe('new-number');
      expect(reactivated.bankName).toBe('New Bank');
      expect(reactivated.accountHolderName).toBe('NEW NAME');
      expect(reactivated.cassoFlowAuthorizationId).toBe('auth-new');
      expect(reactivated.revokedAt).toBeNull();
    });

    it('reactivates an ERROR connection', () => {
      const connection = buildConnection({ status: 'ERROR' });
      expect(
        connection.reactivate({
          accountNumber: connection.accountNumber,
          bankName: connection.bankName,
          accountHolderName: connection.accountHolderName,
          cassoFlowAuthorizationId: connection.cassoFlowAuthorizationId,
        }).status,
      ).toBe('ACTIVE');
    });

    it('throws when reactivating an already-ACTIVE connection', () => {
      const connection = buildConnection({ status: 'ACTIVE' });
      expect(() =>
        connection.reactivate({
          accountNumber: connection.accountNumber,
          bankName: connection.bankName,
          accountHolderName: connection.accountHolderName,
          cassoFlowAuthorizationId: connection.cassoFlowAuthorizationId,
        }),
      ).toThrow();
    });
  });

  describe('rotateApiKey', () => {
    it('updates bankName/accountHolderName on an ACTIVE connection, keeps status/connectedAt', () => {
      const connectedAt = new Date('2026-01-01');
      const connection = buildConnection({
        status: 'ACTIVE',
        bankName: 'Old Bank',
        accountHolderName: 'OLD NAME',
        connectedAt,
      });

      const rotated = connection.rotateApiKey({
        bankName: 'New Bank',
        accountHolderName: 'NEW NAME',
      });

      expect(rotated.status).toBe('ACTIVE');
      expect(rotated.bankName).toBe('New Bank');
      expect(rotated.accountHolderName).toBe('NEW NAME');
      expect(rotated.connectedAt).toBe(connectedAt);
    });

    it('throws when rotating a non-ACTIVE connection', () => {
      const connection = buildConnection({
        status: 'REQUIRES_REAUTHORIZATION',
      });
      expect(() =>
        connection.rotateApiKey({
          bankName: connection.bankName,
          accountHolderName: connection.accountHolderName,
        }),
      ).toThrow(
        'Cannot rotate the API Key of a connection in status REQUIRES_REAUTHORIZATION',
      );
    });
  });

  describe('disconnect', () => {
    it('transitions to DISCONNECTED and sets revokedAt', () => {
      const connection = buildConnection({ status: 'ACTIVE', revokedAt: null });
      const disconnected = connection.disconnect();
      expect(disconnected.status).toBe('DISCONNECTED');
      expect(disconnected.revokedAt).not.toBeNull();
    });

    it('throws when disconnecting an already-DISCONNECTED connection', () => {
      const connection = buildConnection({ status: 'DISCONNECTED' });
      expect(() => connection.disconnect()).toThrow();
    });
  });
});
