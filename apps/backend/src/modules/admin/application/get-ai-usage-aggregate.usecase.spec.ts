import { Organization } from '../../organizations/domain/organization';
import { GetAiUsageAggregateUseCase } from './get-ai-usage-aggregate.usecase';

describe('GetAiUsageAggregateUseCase', () => {
  it('joins aggregate rows with organization names', async () => {
    const aiUsageRepo = {
      aggregateByOrgAndModel: jest.fn().mockResolvedValue([
        {
          organizationId: 'org-1',
          model: 'gpt-5.5',
          requestCount: 10,
          totalTokens: 5000,
          errorCount: 1,
        },
      ]),
    };
    const organizationRepo = {
      findByIds: jest.fn().mockResolvedValue(
        new Map([
          [
            'org-1',
            new Organization({
              id: 'org-1',
              name: 'Acme',
              status: 'ACTIVE',
              createdAt: new Date('2026-08-01'),
            }),
          ],
        ]),
      ),
    };
    const useCase = new GetAiUsageAggregateUseCase(
      aiUsageRepo as any,
      organizationRepo as any,
    );

    const result = await useCase.execute({
      from: new Date('2026-08-01'),
      to: new Date('2026-08-07'),
    });

    expect(organizationRepo.findByIds).toHaveBeenCalledWith(['org-1']);
    expect(result).toEqual([
      {
        organizationId: 'org-1',
        organizationName: 'Acme',
        model: 'gpt-5.5',
        requestCount: 10,
        totalTokens: 5000,
        errorCount: 1,
      },
    ]);
  });
});
