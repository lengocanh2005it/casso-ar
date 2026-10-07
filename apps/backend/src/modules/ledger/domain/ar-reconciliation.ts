import { LedgerEventSubjectType } from './ledger-event-subject-type';

export enum ArReconciliationFindingCode {
  RECEIVABLE_ALLOCATION_MISMATCH = 'RECEIVABLE_ALLOCATION_MISMATCH',
  PAYMENT_ALLOCATION_MISMATCH = 'PAYMENT_ALLOCATION_MISMATCH',
  RECEIVABLE_LEDGER_MISMATCH = 'RECEIVABLE_LEDGER_MISMATCH',
  PAYMENT_LEDGER_MISMATCH = 'PAYMENT_LEDGER_MISMATCH',
  LEDGER_BASELINE_MISSING = 'LEDGER_BASELINE_MISSING',
}

export interface ArReconciliationSubjectSnapshot {
  organizationId: string;
  subjectType: LedgerEventSubjectType;
  subjectId: string;
  storedRollupAmount: number;
  currentBalance: number;
  activeAllocationAmount: number;
  ledgerMovementAmount: number;
  hasRolloutBaseline: boolean;
  hasOpeningEvent: boolean;
}

export interface ArReconciliationFinding {
  organizationId: string;
  subjectType: LedgerEventSubjectType;
  subjectId: string;
  code: ArReconciliationFindingCode;
  storedValue: number | null;
  expectedValue: number | null;
  delta: number | null;
}

export function reconcileArSubject(
  subject: ArReconciliationSubjectSnapshot,
): ArReconciliationFinding[] {
  const isReceivable =
    subject.subjectType === LedgerEventSubjectType.RECEIVABLE;
  const findings: ArReconciliationFinding[] = [];

  if (subject.storedRollupAmount !== subject.activeAllocationAmount) {
    findings.push({
      organizationId: subject.organizationId,
      subjectType: subject.subjectType,
      subjectId: subject.subjectId,
      code: isReceivable
        ? ArReconciliationFindingCode.RECEIVABLE_ALLOCATION_MISMATCH
        : ArReconciliationFindingCode.PAYMENT_ALLOCATION_MISMATCH,
      storedValue: subject.storedRollupAmount,
      expectedValue: subject.activeAllocationAmount,
      delta: subject.storedRollupAmount - subject.activeAllocationAmount,
    });
  }

  const hasLedgerBeginning =
    subject.hasRolloutBaseline ||
    subject.hasOpeningEvent ||
    subject.currentBalance === 0;
  if (!hasLedgerBeginning) {
    findings.push({
      organizationId: subject.organizationId,
      subjectType: subject.subjectType,
      subjectId: subject.subjectId,
      code: ArReconciliationFindingCode.LEDGER_BASELINE_MISSING,
      storedValue: subject.currentBalance,
      expectedValue: null,
      delta: null,
    });
  } else if (subject.currentBalance !== subject.ledgerMovementAmount) {
    findings.push({
      organizationId: subject.organizationId,
      subjectType: subject.subjectType,
      subjectId: subject.subjectId,
      code: isReceivable
        ? ArReconciliationFindingCode.RECEIVABLE_LEDGER_MISMATCH
        : ArReconciliationFindingCode.PAYMENT_LEDGER_MISMATCH,
      storedValue: subject.currentBalance,
      expectedValue: subject.ledgerMovementAmount,
      delta: subject.currentBalance - subject.ledgerMovementAmount,
    });
  }

  return findings;
}
