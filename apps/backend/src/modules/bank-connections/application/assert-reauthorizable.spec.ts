import { ErrorCode } from '../../../common/errors/error-code';
import { BankConnection } from '../domain/bank-connection';
import { assertReauthorizable } from './assert-reauthorizable';

function connectionWithStatus(
  status: BankConnection['status'],
): BankConnection {
  return new BankConnection({
    id: 'conn-1',
    organizationId: 'org-1',
    cassoFlowAuthorizationId: 'auth-1',
    accountNumber: '0011002233',
    bankName: 'Mock Bank',
    accountHolderName: 'MOCK NAME',
    status,
    connectedAt: new Date(),
    lastSyncAt: null,
    revokedAt: null,
    createdAt: new Date(),
  });
}

describe('assertReauthorizable', () => {
  it.each(['REQUIRES_REAUTHORIZATION', 'ERROR'] as const)(
    'accepts a connection awaiting reauthorization or in ERROR (%s)',
    (status) => {
      expect(() =>
        assertReauthorizable('conn-1', connectionWithStatus(status)),
      ).not.toThrow();
    },
  );

  it('accepts a missing bankConnectionId', () => {
    expect(() => assertReauthorizable(null, null)).not.toThrow();
    expect(() => assertReauthorizable(undefined, null)).not.toThrow();
  });

  it.each([
    'ACTIVE',
    'DISCONNECTED',
    'PENDING_AUTHORIZATION',
    'REVOKED',
  ] as const)('rejects re-authorizing a connection in %s', (status) => {
    expect(() =>
      assertReauthorizable('conn-1', connectionWithStatus(status)),
    ).toThrow(expect.objectContaining({ errorCode: ErrorCode.CONFLICT }));
  });
});
