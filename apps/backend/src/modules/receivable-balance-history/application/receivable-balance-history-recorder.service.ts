import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import type { Receivable } from '../../receivables/domain/receivable';
import { BalanceHistoryActorType } from '../domain/balance-history-actor-type';
import { BalanceHistoryChangeSource } from '../domain/balance-history-change-source';
import { BalanceHistoryReasonCode } from '../domain/balance-history-reason-code';
import type { TransitionProvenance } from '../domain/transition-provenance';
import {
  type IReceivableBalanceHistoryRepository,
  RECEIVABLE_BALANCE_HISTORY_REPOSITORY,
} from './receivable-balance-history.repository.port';

const REASON_CODE_BY_CHANGE_SOURCE: Record<
  BalanceHistoryChangeSource,
  BalanceHistoryReasonCode
> = {
  [BalanceHistoryChangeSource.CREATE]:
    BalanceHistoryReasonCode.RECEIVABLE_CREATED,
  [BalanceHistoryChangeSource.ALLOCATE]:
    BalanceHistoryReasonCode.PAYMENT_ALLOCATED,
  [BalanceHistoryChangeSource.UNDO]:
    BalanceHistoryReasonCode.PAYMENT_ALLOCATION_UNDONE,
  [BalanceHistoryChangeSource.CANCEL]:
    BalanceHistoryReasonCode.RECEIVABLE_CANCELLED,
  [BalanceHistoryChangeSource.WRITE_OFF]:
    BalanceHistoryReasonCode.RECEIVABLE_WRITTEN_OFF,
  [BalanceHistoryChangeSource.ROLLOUT_BASELINE]:
    BalanceHistoryReasonCode.ROLLOUT_BASELINE,
};

export interface RecordBalanceHistoryInput {
  receivable: Receivable;
  changeSource: BalanceHistoryChangeSource;
  provenance: TransitionProvenance;
  note?: string;
  transitionReferenceId?: string;
  manager?: EntityManager;
}

@Injectable()
export class ReceivableBalanceHistoryRecorderService {
  constructor(
    @Inject(RECEIVABLE_BALANCE_HISTORY_REPOSITORY)
    private readonly historyRepo: IReceivableBalanceHistoryRepository,
  ) {}

  async record(input: RecordBalanceHistoryInput): Promise<void> {
    this.assertProvenanceInvariants(input.provenance);
    const now = new Date();
    await this.historyRepo.append(
      {
        id: randomUUID(),
        organizationId: input.receivable.organizationId,
        receivableId: input.receivable.id,
        status: input.receivable.status,
        remainingAmount: input.receivable.remainingAmount,
        effectiveAt: now,
        changeSource: input.changeSource,
        reasonCode: REASON_CODE_BY_CHANGE_SOURCE[input.changeSource],
        actorType: input.provenance.actorType,
        actorUserId: input.provenance.actorUserId,
        note: input.note ?? null,
        transitionReferenceId: input.transitionReferenceId ?? null,
        createdAt: now,
      },
      input.manager,
    );
  }

  private assertProvenanceInvariants(provenance: TransitionProvenance): void {
    if (
      provenance.actorType === BalanceHistoryActorType.USER &&
      !provenance.actorUserId
    ) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'USER provenance requires an actor user id',
      );
    }
    if (
      provenance.actorType !== BalanceHistoryActorType.USER &&
      provenance.actorUserId !== null
    ) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        `${provenance.actorType} provenance must not carry an actor user id`,
      );
    }
  }
}
