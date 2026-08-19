import { Injectable } from '@nestjs/common';
import { LedgerEventKind } from '../../ledger/domain/ledger-event-kind';
import { BalanceHistoryChangeSource } from '../../receivable-balance-history/domain/balance-history-change-source';
import type { Receivable } from '../domain/receivable';
import { ReceivableTransitionRunnerService } from './receivable-transition-runner.service';

@Injectable()
export class WriteOffReceivableUseCase {
  constructor(
    private readonly transitionRunner: ReceivableTransitionRunnerService,
  ) {}

  async execute(receivableId: string): Promise<Receivable> {
    return this.transitionRunner.run({
      receivableId,
      changeSource: BalanceHistoryChangeSource.WRITE_OFF,
      ledgerKind: LedgerEventKind.RECEIVABLE_WRITTEN_OFF,
      transition: (receivable) => receivable.writeOff(),
    });
  }
}
