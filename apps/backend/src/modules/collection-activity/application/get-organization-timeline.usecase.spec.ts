import {
  CollectionActivity,
  CollectionActivityType,
} from '../domain/collection-activity';
import { GetOrganizationTimelineUseCase } from './get-organization-timeline.usecase';

describe('GetOrganizationTimelineUseCase', () => {
  it('passes page and limit down to the repository and returns the envelope', async () => {
    const activityRepo = {
      create: jest.fn(),
      findByReceivableId: jest.fn(),
      findByCustomerId: jest.fn(),
      findByOrganizationId: jest
        .fn()
        .mockResolvedValue({ items: [], total: 0 }),
    };

    const useCase = new GetOrganizationTimelineUseCase(activityRepo as any);
    const result = await useCase.execute(2, 25);

    expect(activityRepo.findByOrganizationId).toHaveBeenCalledWith(2, 25);
    expect(result).toEqual({ items: [], total: 0, page: 2, limit: 25 });
  });

  it('returns activities across the whole organization', async () => {
    const activities = [
      new CollectionActivity({
        id: 'act-1',
        organizationId: 'org-1',
        receivableId: 'rec-1',
        customerId: 'cust-1',
        activityType: CollectionActivityType.PAYMENT_RECEIVED,
        description: 'x',
        metadata: {},
        createdByUserId: null,
        createdAt: new Date('2026-08-03'),
      }),
    ];
    const activityRepo = {
      create: jest.fn(),
      findByReceivableId: jest.fn(),
      findByCustomerId: jest.fn(),
      findByOrganizationId: jest
        .fn()
        .mockResolvedValue({ items: activities, total: 1 }),
    };

    const useCase = new GetOrganizationTimelineUseCase(activityRepo as any);
    const result = await useCase.execute(1, 20);

    expect(result.items).toBe(activities);
  });
});
