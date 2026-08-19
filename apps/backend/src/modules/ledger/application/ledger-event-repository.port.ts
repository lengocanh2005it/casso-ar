import type { EntityManager } from 'typeorm';
import type { LedgerEvent } from '../domain/ledger-event';

export const LEDGER_EVENT_REPOSITORY = Symbol('LEDGER_EVENT_REPOSITORY');

export interface ILedgerEventRepository {
  append(entry: LedgerEvent, manager?: EntityManager): Promise<void>;
}
