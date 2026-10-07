import { Inject, Injectable } from '@nestjs/common';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import {
  type ArReconciliationFinding,
  reconcileArSubject,
} from '../domain/ar-reconciliation';
import {
  AR_RECONCILIATION_QUERY,
  type ArReconciliationCursor,
  type IArReconciliationQuery,
} from './ar-reconciliation-query.port';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export interface ReconcileArBalancesInput {
  cursor?: ArReconciliationCursor | null;
  limit?: number;
}

export interface ReconcileArBalancesResult {
  findings: ArReconciliationFinding[];
  nextCursor: ArReconciliationCursor | null;
  complete: boolean;
}

@Injectable()
export class ReconcileArBalancesUseCase {
  constructor(
    @Inject(AR_RECONCILIATION_QUERY)
    private readonly reconciliationQuery: IArReconciliationQuery,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(
    input: ReconcileArBalancesInput,
  ): Promise<ReconcileArBalancesResult> {
    const organizationId = this.tenantContext.getOrganizationId();
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, input.limit ?? DEFAULT_LIMIT),
    );
    const page = await this.reconciliationQuery.listPage(
      organizationId,
      input.cursor ?? null,
      limit,
    );

    return {
      findings: page.subjects.flatMap(reconcileArSubject),
      nextCursor: page.nextCursor,
      complete: page.nextCursor === null,
    };
  }
}
