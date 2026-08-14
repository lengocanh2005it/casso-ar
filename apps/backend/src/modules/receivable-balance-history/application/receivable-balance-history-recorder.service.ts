import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { Receivable } from '../../receivables/domain/receivable';
import type { BalanceHistoryChangeSource } from '../domain/balance-history-change-source';
import {
  type IReceivableBalanceHistoryRepository,
  RECEIVABLE_BALANCE_HISTORY_REPOSITORY,
} from './receivable-balance-history.repository.port';

@Injectable()
export class ReceivableBalanceHistoryRecorderService {
  constructor(
    @Inject(RECEIVABLE_BALANCE_HISTORY_REPOSITORY)
    private readonly historyRepo: IReceivableBalanceHistoryRepository,
  ) {}

  async record(
    receivable: Receivable,
    changeSource: BalanceHistoryChangeSource,
    manager?: EntityManager,
    changeReason: string | null = null,
  ): Promise<void> {
    const now = new Date();
    await this.historyRepo.append(
      {
        id: randomUUID(),
        organizationId: receivable.organizationId,
        receivableId: receivable.id,
        status: receivable.status,
        remainingAmount: receivable.remainingAmount,
        effectiveAt: now,
        changeSource,
        changeReason,
        createdAt: now,
      },
      manager,
    );
  }
}
