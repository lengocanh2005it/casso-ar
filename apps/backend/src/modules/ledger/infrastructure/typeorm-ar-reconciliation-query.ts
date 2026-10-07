import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import type {
  ArReconciliationCursor,
  ArReconciliationPage,
  IArReconciliationQuery,
} from '../application/ar-reconciliation-query.port';
import type { ArReconciliationSubjectSnapshot } from '../domain/ar-reconciliation';
import { LedgerEventSubjectType } from '../domain/ledger-event-subject-type';

const RECONCILIATION_PAGE_SQL = `
WITH candidates AS (
  SELECT
    0 AS subject_order,
    'RECEIVABLE'::text AS subject_type,
    r.id AS subject_id,
    r."paidAmount" AS stored_rollup_amount,
    CASE
      WHEN r.status IN ('CANCELLED', 'WRITTEN_OFF') THEN 0
      ELSE r."originalAmount" - r."paidAmount"
    END AS current_balance
  FROM receivables r
  WHERE r."organizationId" = $1

  UNION ALL

  SELECT
    1 AS subject_order,
    'PAYMENT'::text AS subject_type,
    p.id AS subject_id,
    p."allocatedAmount" AS stored_rollup_amount,
    p."totalAmount" - p."allocatedAmount" AS current_balance
  FROM payments p
  WHERE p."organizationId" = $1
),
limited_candidates AS (
  SELECT c.*
  FROM candidates c
  WHERE $2::integer IS NULL
    OR c.subject_order > $2::integer
    OR (
      c.subject_order = $2::integer
      AND c.subject_id > $3::uuid
    )
  ORDER BY c.subject_order, c.subject_id
  LIMIT $4
),
page_subjects AS (
  SELECT candidate.*
  FROM limited_candidates candidate
  ORDER BY candidate.subject_order, candidate.subject_id
  LIMIT $5
),
allocation_totals AS (
  SELECT
    'RECEIVABLE'::text AS subject_type,
    allocation."receivableId" AS subject_id,
    SUM(allocation."allocatedAmount") AS amount
  FROM page_subjects subject
  JOIN payment_allocations allocation
    ON allocation."organizationId" = $1
    AND allocation."receivableId" = subject.subject_id::text
    AND allocation."deletedAt" IS NULL
  WHERE subject.subject_type = 'RECEIVABLE'
  GROUP BY allocation."receivableId"

  UNION ALL

  SELECT
    'PAYMENT'::text AS subject_type,
    allocation."paymentId" AS subject_id,
    SUM(allocation."allocatedAmount") AS amount
  FROM page_subjects subject
  JOIN payment_allocations allocation
    ON allocation."organizationId" = $1
    AND allocation."paymentId" = subject.subject_id::text
    AND allocation."deletedAt" IS NULL
  WHERE subject.subject_type = 'PAYMENT'
  GROUP BY allocation."paymentId"
),
ledger_totals AS (
  SELECT
    subject.subject_type,
    subject.subject_id,
    SUM(event.amount) AS amount,
    BOOL_OR(
      event.kind = CASE subject.subject_type
        WHEN 'RECEIVABLE' THEN 'RECEIVABLE_ROLLOUT_BASELINE'
        ELSE 'PAYMENT_ROLLOUT_BASELINE'
      END
    ) AS has_rollout_baseline,
    BOOL_OR(
      event.kind = CASE subject.subject_type
        WHEN 'RECEIVABLE' THEN 'RECEIVABLE_CREATED'
        ELSE 'PAYMENT_RECEIVED'
      END
    ) AS has_opening_event
  FROM page_subjects subject
  LEFT JOIN ledger_events event
    ON event."organizationId" = $1
    AND event."subjectType"::text = subject.subject_type
    AND event."subjectId" = subject.subject_id
  GROUP BY subject.subject_type, subject.subject_id
)
SELECT
  subject.subject_type,
  subject.subject_id,
  subject.stored_rollup_amount,
  subject.current_balance,
  COALESCE(allocation.amount, 0) AS active_allocation_amount,
  COALESCE(ledger.amount, 0) AS ledger_movement_amount,
  COALESCE(ledger.has_rollout_baseline, FALSE) AS has_rollout_baseline,
  COALESCE(ledger.has_opening_event, FALSE) AS has_opening_event,
  (SELECT COUNT(*) > $5 FROM limited_candidates) AS has_more
FROM page_subjects subject
LEFT JOIN allocation_totals allocation
  ON allocation.subject_type = subject.subject_type
  AND allocation.subject_id = subject.subject_id::text
LEFT JOIN ledger_totals ledger
  ON ledger.subject_type = subject.subject_type
  AND ledger.subject_id = subject.subject_id
ORDER BY subject.subject_order, subject.subject_id
`;

interface RawArReconciliationSubjectSnapshot {
  subject_type: LedgerEventSubjectType;
  subject_id: string;
  stored_rollup_amount: string | number;
  current_balance: string | number;
  active_allocation_amount: string | number;
  ledger_movement_amount: string | number;
  has_rollout_baseline: boolean;
  has_opening_event: boolean;
  has_more: boolean;
}

function toSnapshot(
  row: RawArReconciliationSubjectSnapshot,
): ArReconciliationSubjectSnapshot {
  return {
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    storedRollupAmount: Number(row.stored_rollup_amount),
    currentBalance: Number(row.current_balance),
    activeAllocationAmount: Number(row.active_allocation_amount),
    ledgerMovementAmount: Number(row.ledger_movement_amount),
    hasRolloutBaseline: row.has_rollout_baseline,
    hasOpeningEvent: row.has_opening_event,
  };
}

@Injectable()
export class TypeOrmArReconciliationQuery implements IArReconciliationQuery {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async listPage(
    organizationId: string,
    cursor: ArReconciliationCursor | null,
    limit: number,
  ): Promise<ArReconciliationPage> {
    const cursorOrder = cursor
      ? cursor.subjectType === LedgerEventSubjectType.RECEIVABLE
        ? 0
        : 1
      : null;
    const rows = (await this.dataSource.query(RECONCILIATION_PAGE_SQL, [
      organizationId,
      cursorOrder,
      cursor?.subjectId ?? null,
      limit + 1,
      limit,
    ])) as RawArReconciliationSubjectSnapshot[];
    const hasMore = rows[0]?.has_more ?? false;
    const pageRows = rows.slice(0, limit);
    const last = pageRows.at(-1);

    return {
      subjects: pageRows.map(toSnapshot),
      nextCursor:
        hasMore && last
          ? {
              subjectType: last.subject_type,
              subjectId: last.subject_id,
            }
          : null,
    };
  }
}
