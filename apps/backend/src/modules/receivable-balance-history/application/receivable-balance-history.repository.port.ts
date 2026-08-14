import type { EntityManager } from 'typeorm';
import type { ReceivableBalanceHistoryEntry } from '../domain/receivable-balance-history-entry';

export const RECEIVABLE_BALANCE_HISTORY_REPOSITORY = Symbol(
  'RECEIVABLE_BALANCE_HISTORY_REPOSITORY',
);

export interface IReceivableBalanceHistoryRepository {
  append(
    entry: ReceivableBalanceHistoryEntry,
    manager?: EntityManager,
  ): Promise<void>;
}
