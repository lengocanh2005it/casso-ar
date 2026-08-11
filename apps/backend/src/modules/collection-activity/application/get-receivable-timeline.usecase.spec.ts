import {
  CollectionActivity,
  CollectionActivityType,
} from '../domain/collection-activity';
import { GetReceivableTimelineUseCase } from './get-receivable-timeline.usecase';

describe('GetReceivableTimelineUseCase', () => {
  it('returns the paginated envelope for the receivable', async () => {
    const activities = [
      new CollectionActivity({
        id: 'act-2',
        organizationId: 'org-1',
        receivableId: 'rec-1',
        customerId: 'cust-1',
        activityType: CollectionActivityType.RECEIVABLE_CLOSED,
        description: 'x',
        metadata: {},
        createdByUserId: null,
        createdAt: new Date('2026-08-03T10:00:00Z'),
      }),
      new CollectionActivity({
        id: 'act-1',
        organizationId: 'org-1',
        receivableId: 'rec-1',
        customerId: 'cust-1',
        activityType: CollectionActivityType.PAYMENT_RECEIVED,
        description: 'y',
        metadata: {},
        createdByUserId: null,
        createdAt: new Date('2026-08-03T09:00:00Z'),
      }),
    ];
    const activityRepo = {
      create: jest.fn(),
      findByReceivableId: jest.fn().mockResolvedValue({
        items: activities,
        total: 2,
      }),
      findByCustomerId: jest.fn(),
    };

    const useCase = new GetReceivableTimelineUseCase(activityRepo as any);
    const result = await useCase.execute('rec-1', 1, 20);

    expect(result.items).toBe(activities);
    expect(result.total).toBe(2);
    expect(activityRepo.findByReceivableId).toHaveBeenCalledWith(
      'rec-1',
      1,
      20,
    );
  });
});
