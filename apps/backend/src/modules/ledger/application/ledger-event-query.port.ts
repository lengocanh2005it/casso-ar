import type { LedgerEvent } from '../domain/ledger-event';
import type { LedgerEventKind } from '../domain/ledger-event-kind';
import type { LedgerEventSubjectType } from '../domain/ledger-event-subject-type';

export const LEDGER_EVENT_QUERY = Symbol('LEDGER_EVENT_QUERY');

export interface LedgerEventListFilters {
  subjectType: LedgerEventSubjectType;
  subjectId: string;
  kind?: LedgerEventKind;
}

export interface LedgerEventListPage {
  items: LedgerEvent[];
  total: number;
}

export interface ILedgerEventQuery {
  list(
    organizationId: string,
    filters: LedgerEventListFilters,
    page: number,
    limit: number,
  ): Promise<LedgerEventListPage>;
}
