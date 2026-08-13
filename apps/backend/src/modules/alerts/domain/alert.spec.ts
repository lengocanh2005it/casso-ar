import { Alert, type AlertProps, AlertType } from './alert';

function buildAlert(overrides: Partial<AlertProps> = {}) {
  return new Alert({
    id: 'alert-1',
    organizationId: 'org-1',
    userId: 'user-1',
    type: AlertType.BANK_CONNECTION_ERROR,
    entityType: 'bank_connection',
    entityId: 'conn-1',
    readAt: null,
    createdAt: new Date('2026-08-13T00:00:00Z'),
    ...overrides,
  });
}

describe('Alert', () => {
  it('isRead() is false when readAt is null', () => {
    expect(buildAlert().isRead()).toBe(false);
  });

  it('isRead() is true when readAt is set', () => {
    expect(
      buildAlert({ readAt: new Date('2026-08-13T01:00:00Z') }).isRead(),
    ).toBe(true);
  });

  it('markRead() sets readAt to the given time and returns a new instance', () => {
    const alert = buildAlert();
    const now = new Date('2026-08-13T02:00:00Z');

    const read = alert.markRead(now);

    expect(read).not.toBe(alert);
    expect(read.readAt).toEqual(now);
    expect(read.isRead()).toBe(true);
    expect(alert.isRead()).toBe(false);
  });

  it('markRead() is a no-op (same instance) when already read', () => {
    const readAt = new Date('2026-08-13T01:00:00Z');
    const alert = buildAlert({ readAt });

    const result = alert.markRead(new Date('2026-08-13T03:00:00Z'));

    expect(result).toBe(alert);
    expect(result.readAt).toEqual(readAt);
  });
});
