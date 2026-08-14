import { deriveCopilotDraftStatus } from './derive-draft-status';

describe('deriveCopilotDraftStatus', () => {
  const now = new Date('2026-08-14T10:00:00Z');

  it('returns DRAFTED when there is no pending action', () => {
    expect(deriveCopilotDraftStatus(null, now)).toBe('DRAFTED');
  });

  it('returns PENDING when the action is still within the expiry window', () => {
    const action = {
      status: 'PENDING' as const,
      createdAt: new Date('2026-08-14T09:55:00Z'),
    };
    expect(deriveCopilotDraftStatus(action, now)).toBe('PENDING');
  });

  it('returns EXPIRED when a PENDING action is older than the expiry window', () => {
    const action = {
      status: 'PENDING' as const,
      createdAt: new Date('2026-08-14T09:00:00Z'),
    };
    expect(deriveCopilotDraftStatus(action, now)).toBe('EXPIRED');
  });

  it('passes through CONFIRMED, CANCELLED, and already-persisted EXPIRED as-is', () => {
    for (const status of ['CONFIRMED', 'CANCELLED', 'EXPIRED'] as const) {
      expect(deriveCopilotDraftStatus({ status, createdAt: now }, now)).toBe(
        status,
      );
    }
  });
});
