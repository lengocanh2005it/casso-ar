import { PlanId } from '@casso-ledger/shared-types';
import { GetPublicPlansUseCase } from './get-public-plans.usecase';

describe('GetPublicPlansUseCase', () => {
  it('returns the full plan catalog unchanged', () => {
    const useCase = new GetPublicPlansUseCase();

    const result = useCase.execute();

    expect(result).toHaveLength(4);
    expect(result.map((p) => p.planId)).toEqual([
      PlanId.FREE,
      PlanId.STARTER,
      PlanId.BUSINESS,
      PlanId.ENTERPRISE,
    ]);
    expect(result.find((p) => p.planId === PlanId.BUSINESS)?.priceVnd).toBe(
      999_000,
    );
  });
});
