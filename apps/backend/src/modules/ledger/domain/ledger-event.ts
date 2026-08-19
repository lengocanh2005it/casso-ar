import type { LedgerEventKind } from './ledger-event-kind';
import type { LedgerEventSubjectType } from './ledger-event-subject-type';

export interface LedgerEvent {
  id: string;
  organizationId: string;
  subjectType: LedgerEventSubjectType;
  subjectId: string;
  kind: LedgerEventKind;
  amount: number;
  effectiveAt: Date;
  transitionReferenceId: string | null;
  createdAt: Date;
}

export function assertValidLedgerEventAmount(amount: number): void {
  if (amount === 0) {
    throw new Error('Ledger event amount must not be zero');
  }
  if (!Number.isInteger(amount)) {
    throw new Error('Ledger event amount must be an integer');
  }
}
