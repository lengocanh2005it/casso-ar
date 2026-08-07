import { Dispute, DisputeNotOpenError, DisputeStatus } from './dispute';

function buildOpenDispute(): Dispute {
  return new Dispute({
    id: 'dispute-1',
    organizationId: 'org-1',
    receivableId: 'receivable-1',
    reason: 'Số tiền trên hóa đơn không khớp.',
    status: DisputeStatus.OPEN,
    openedByUserId: 'user-1',
    resolvedByUserId: null,
    resolvedAt: null,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    version: 1,
  });
}

describe('Dispute', () => {
  it('resolves an open dispute without mutating the original instance', () => {
    const dispute = buildOpenDispute();

    const resolved = dispute.resolve('user-2');

    expect(resolved.status).toBe(DisputeStatus.RESOLVED);
    expect(resolved.resolvedByUserId).toBe('user-2');
    expect(resolved.resolvedAt).toBeInstanceOf(Date);
    expect(dispute.status).toBe(DisputeStatus.OPEN);
  });

  it('rejects resolving a dispute that is already resolved', () => {
    const resolved = buildOpenDispute().resolve('user-2');

    expect(() => resolved.resolve('user-3')).toThrow(DisputeNotOpenError);
  });
});
