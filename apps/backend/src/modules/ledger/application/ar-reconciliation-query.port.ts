import type { ArReconciliationSubjectSnapshot } from '../domain/ar-reconciliation';
import type { LedgerEventSubjectType } from '../domain/ledger-event-subject-type';

export const AR_RECONCILIATION_QUERY = Symbol('AR_RECONCILIATION_QUERY');

export interface ArReconciliationCursor {
  subjectType: LedgerEventSubjectType;
  subjectId: string;
}

export interface ArReconciliationPage {
  subjects: ArReconciliationSubjectSnapshot[];
  nextCursor: ArReconciliationCursor | null;
}

export interface IArReconciliationQuery {
  listPage(
    organizationId: string,
    cursor: ArReconciliationCursor | null,
    limit: number,
  ): Promise<ArReconciliationPage>;
}
