import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { DataSource } from 'typeorm';
import { AuditContextService } from '../../../common/audit/audit-context';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  EVENT_PUBLISHER,
  type IEventPublisher,
} from '../../../common/events/event-publisher.port';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { LedgerEventRecorderService } from '../../ledger/application/ledger-event-recorder.service';
import { LedgerEventKind } from '../../ledger/domain/ledger-event-kind';
import { LedgerEventSubjectType } from '../../ledger/domain/ledger-event-subject-type';
import { ReceivableBalanceHistoryRecorderService } from '../../receivable-balance-history/application/receivable-balance-history-recorder.service';
import { BalanceHistoryActorType } from '../../receivable-balance-history/domain/balance-history-actor-type';
import { BalanceHistoryChangeSource } from '../../receivable-balance-history/domain/balance-history-change-source';
import type { Receivable } from '../domain/receivable';
import {
  type IReceivableRepository,
  RECEIVABLE_REPOSITORY,
} from './receivable-repository.port';

export interface RunReceivableTransitionInput {
  receivableId: string;
  changeSource: BalanceHistoryChangeSource;
  ledgerKind: LedgerEventKind;
  /** Usecase-specific pre-condition check, run after load, before setBefore. */
  assertTransitionAllowed?: (receivable: Receivable) => void;
  /** Domain transition, including the usecase-specific error-code mapping. */
  transition: (receivable: Receivable) => Receivable;
}

/**
 * Shared wiring for single-receivable status transitions (cancel, write-off):
 * load-for-update, NOT_FOUND, audit before-state, domain transition, save,
 * user provenance, balance-history record — all inside one transaction — then
 * a fire-and-forget `receivable.status-closed` emit after commit.
 * Each usecase supplies its own pre-condition and error mapping via the
 * callbacks.
 */
@Injectable()
export class ReceivableTransitionRunnerService {
  constructor(
    @Inject(RECEIVABLE_REPOSITORY)
    private readonly receivableRepo: IReceivableRepository,
    private readonly dataSource: DataSource,
    private readonly auditContext: AuditContextService,
    private readonly tenantContext: TenantContextService,
    @Inject(EVENT_PUBLISHER)
    private readonly eventPublisher: IEventPublisher,
    private readonly historyRecorder: ReceivableBalanceHistoryRecorderService,
    private readonly ledgerRecorder: LedgerEventRecorderService,
  ) {}

  async run(input: RunReceivableTransitionInput): Promise<Receivable> {
    const updated = await this.dataSource.transaction(
      async (manager: EntityManager) => {
        const receivable = await this.receivableRepo.findByIdForUpdate(
          input.receivableId,
          manager,
        );
        if (!receivable) {
          throw new AppError(
            ErrorCode.RECEIVABLE_NOT_FOUND,
            'Không tìm thấy khoản phải thu.',
          );
        }

        const remainingBefore = receivable.remainingAmount;

        input.assertTransitionAllowed?.(receivable);

        this.auditContext.setBefore(receivable);
        const next = input.transition(receivable);
        await this.receivableRepo.save(next, manager);

        const user = this.tenantContext.getCurrentUser();
        if (!user) {
          throw new AppError(ErrorCode.UNAUTHORIZED, 'Yêu cầu đăng nhập.');
        }
        await this.historyRecorder.record({
          receivable: next,
          changeSource: input.changeSource,
          provenance: {
            actorType: BalanceHistoryActorType.USER,
            actorUserId: user.userId,
          },
          manager,
        });
        await this.ledgerRecorder.record({
          organizationId: next.organizationId,
          subjectType: LedgerEventSubjectType.RECEIVABLE,
          subjectId: next.id,
          kind: input.ledgerKind,
          amount: -remainingBefore,
          manager,
        });
        return next;
      },
    );

    this.eventPublisher.emit('receivable.status-closed', {
      receivableId: updated.id,
      organizationId: updated.organizationId,
    });
    return updated;
  }
}
