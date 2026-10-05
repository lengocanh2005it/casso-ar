import {
  PlanId,
  PlanPaymentHistoryProvenance,
  PlanPaymentHistorySourceType,
  PlanPaymentReceiptOutcome,
} from '@casso-ar/shared-types';
import { ListPlanPaymentHistoryUseCase } from './list-plan-payment-history.usecase';

describe('ListPlanPaymentHistoryUseCase', () => {
  it('scopes the paginated history query to the current organization', async () => {
    const item = {
      sourceType: PlanPaymentHistorySourceType.PLAN_UPGRADE_ORDER,
      orderCode: '90000001',
      planId: PlanId.STARTER,
      receivedAmount: null,
      initialOutcome: PlanPaymentReceiptOutcome.ACCEPTED,
      provenance: PlanPaymentHistoryProvenance.LEGACY_BACKFILL,
      confirmedAt: new Date('2026-10-01T12:00:00.000Z'),
    };
    const historyRepo = {
      findPage: jest.fn().mockResolvedValue({ items: [item], total: 11 }),
    };
    const tenantContext = {
      getOrganizationId: jest.fn().mockReturnValue('org-a'),
    };
    const useCase = new ListPlanPaymentHistoryUseCase(
      historyRepo as never,
      tenantContext as never,
    );

    const result = await useCase.execute({ page: 2, limit: 5 });

    expect(tenantContext.getOrganizationId).toHaveBeenCalledTimes(1);
    expect(historyRepo.findPage).toHaveBeenCalledWith({
      organizationId: 'org-a',
      page: 2,
      limit: 5,
    });
    expect(result).toEqual({ items: [item], total: 11, page: 2, limit: 5 });
  });
});
