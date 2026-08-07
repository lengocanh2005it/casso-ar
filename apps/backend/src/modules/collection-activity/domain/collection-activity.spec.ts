import {
  CollectionActivity,
  CollectionActivityType,
  MANUAL_ACTIVITY_TYPES,
} from './collection-activity';

describe('CollectionActivity domain entity', () => {
  it('creates an activity with metadata and a nullable createdByUserId (system-recorded)', () => {
    const activity = new CollectionActivity({
      id: 'act-1',
      organizationId: 'org-1',
      receivableId: 'rec-1',
      customerId: 'cust-1',
      activityType: CollectionActivityType.PAYMENT_RECEIVED,
      description: 'Received payment of 30,000,000 VND',
      metadata: { paymentId: 'pay-1', amount: 30_000_000 },
      createdByUserId: null,
      createdAt: new Date('2026-08-03'),
    });

    expect(activity.activityType).toBe(CollectionActivityType.PAYMENT_RECEIVED);
    expect(activity.createdByUserId).toBeNull();
    expect(activity.metadata).toEqual({
      paymentId: 'pay-1',
      amount: 30_000_000,
    });
  });

  it('creates a manual activity with a non-null createdByUserId', () => {
    const activity = new CollectionActivity({
      id: 'act-2',
      organizationId: 'org-1',
      receivableId: 'rec-1',
      customerId: 'cust-1',
      activityType: CollectionActivityType.MANUAL_CALL,
      description: 'Called to remind the customer',
      metadata: {},
      createdByUserId: 'user-1',
      createdAt: new Date('2026-08-03'),
    });

    expect(activity.createdByUserId).toBe('user-1');
  });

  it('exposes MANUAL_ACTIVITY_TYPES as exactly the 3 manually-recordable types', () => {
    expect(MANUAL_ACTIVITY_TYPES).toEqual([
      CollectionActivityType.MANUAL_CALL,
      CollectionActivityType.MANUAL_NOTE,
      CollectionActivityType.PAYMENT_COMMITMENT,
    ]);
  });
});
