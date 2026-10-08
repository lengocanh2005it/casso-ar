import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { DataSource } from 'typeorm';
import {
  AuditActionType,
  AuditEntityType,
} from '../../../common/audit/audit.enums';
import { AuditLog } from '../../../common/audit/audit-log';
import {
  AUDIT_LOG_REPOSITORY,
  type IAuditLogRepository,
} from '../../../common/audit/audit-log-repository.port';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  EVENT_PUBLISHER,
  type IEventPublisher,
} from '../../../common/events/event-publisher.port';
import { LedgerEventRecorderService } from '../../ledger/application/ledger-event-recorder.service';
import { LedgerEventKind } from '../../ledger/domain/ledger-event-kind';
import { LedgerEventSubjectType } from '../../ledger/domain/ledger-event-subject-type';
import { ReceivableBalanceHistoryRecorderService } from '../../receivable-balance-history/application/receivable-balance-history-recorder.service';
import { BalanceHistoryActorType } from '../../receivable-balance-history/domain/balance-history-actor-type';
import { BalanceHistoryChangeSource } from '../../receivable-balance-history/domain/balance-history-change-source';
import {
  type IReceivableRepository,
  RECEIVABLE_REPOSITORY,
} from '../../receivables/application/receivable-repository.port';
import {
  type IPaymentAllocationRepository,
  PAYMENT_ALLOCATION_REPOSITORY,
} from './payment-allocation-repository.port';
import {
  type IPaymentRepository,
  PAYMENT_REPOSITORY,
} from './payment-repository.port';

export interface UndoPaymentAllocationInput {
  allocationId: string;
  deletedByUserId: string;
  undoReason: string;
}

@Injectable()
export class UndoPaymentAllocationUseCase {
  constructor(
    @Inject(PAYMENT_ALLOCATION_REPOSITORY)
    private readonly allocationRepo: IPaymentAllocationRepository,
    @Inject(PAYMENT_REPOSITORY)
    private readonly paymentRepo: IPaymentRepository,
    @Inject(RECEIVABLE_REPOSITORY)
    private readonly receivableRepo: IReceivableRepository,
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly auditLogRepo: IAuditLogRepository,
    private readonly dataSource: DataSource,
    private readonly historyRecorder: ReceivableBalanceHistoryRecorderService,
    private readonly ledgerRecorder: LedgerEventRecorderService,
    @Inject(EVENT_PUBLISHER)
    private readonly eventPublisher: IEventPublisher,
  ) {}

  async execute(input: UndoPaymentAllocationInput): Promise<void> {
    let activityEvent: Record<string, unknown> | undefined;

    await this.dataSource.transaction(async (manager: EntityManager) => {
      const allocation = await this.allocationRepo.findByIdForUpdate(
        input.allocationId,
        manager,
      );
      if (!allocation) {
        throw new AppError(
          ErrorCode.ALLOCATION_NOT_FOUND,
          'Phân bổ thanh toán không tồn tại',
        );
      }
      if (!allocation.isActive()) {
        throw new AppError(
          ErrorCode.ALLOCATION_ALREADY_UNDONE,
          'Phân bổ thanh toán đã được hoàn tác',
        );
      }

      const receivable = await this.receivableRepo.findByIdForUpdate(
        allocation.receivableId,
        manager,
      );
      const payment = await this.paymentRepo.findByIdForUpdate(
        allocation.paymentId,
        manager,
      );
      if (!payment) {
        throw new AppError(
          ErrorCode.PAYMENT_NOT_FOUND,
          'Thanh toán không tồn tại',
        );
      }
      if (!receivable) {
        throw new AppError(
          ErrorCode.RECEIVABLE_NOT_FOUND,
          'Khoản phải thu không tồn tại',
        );
      }

      const undoneAllocation = allocation.undo(
        input.deletedByUserId,
        input.undoReason,
      );
      const updatedPayment = payment.withRemovedAllocation(
        allocation.allocatedAmount,
      );
      const updatedReceivable = receivable.removePaymentAllocation(
        allocation.allocatedAmount,
      );

      await this.allocationRepo.save(undoneAllocation, manager);
      await this.paymentRepo.save(updatedPayment, manager);
      await this.receivableRepo.save(updatedReceivable, manager);
      await this.historyRecorder.record({
        receivable: updatedReceivable,
        changeSource: BalanceHistoryChangeSource.UNDO,
        provenance: {
          actorType: BalanceHistoryActorType.USER,
          actorUserId: input.deletedByUserId,
        },
        note: input.undoReason,
        transitionReferenceId: allocation.id,
        manager,
      });
      await this.ledgerRecorder.record({
        organizationId: allocation.organizationId,
        subjectType: LedgerEventSubjectType.RECEIVABLE,
        subjectId: updatedReceivable.id,
        kind: LedgerEventKind.RECEIVABLE_ALLOCATION_UNDONE,
        amount: allocation.allocatedAmount,
        transitionReferenceId: allocation.id,
        manager,
      });
      await this.ledgerRecorder.record({
        organizationId: allocation.organizationId,
        subjectType: LedgerEventSubjectType.PAYMENT,
        subjectId: updatedPayment.id,
        kind: LedgerEventKind.PAYMENT_ALLOCATION_UNDONE,
        amount: allocation.allocatedAmount,
        transitionReferenceId: allocation.id,
        manager,
      });
      await this.auditLogRepo.create(
        new AuditLog({
          organizationId: allocation.organizationId,
          userId: input.deletedByUserId,
          actionType: AuditActionType.PAYMENT_ALLOCATE_UNDO,
          entityType: AuditEntityType.PAYMENT_ALLOCATION,
          entityId: allocation.id,
          relatedReceivableId: allocation.receivableId,
          beforeState: { ...allocation },
          afterState: { ...undoneAllocation },
          ipAddress: null,
          createdAt: new Date(),
        }),
        manager,
      );

      activityEvent = {
        allocationId: allocation.id,
        paymentId: allocation.paymentId,
        receivableId: allocation.receivableId,
        customerId: receivable.customerId,
        organizationId: allocation.organizationId,
        amount: allocation.allocatedAmount,
        undoneByUserId: input.deletedByUserId,
        undoReason: input.undoReason,
      };
    });

    if (activityEvent) {
      this.eventPublisher.emit('payment.allocation-undone', activityEvent);
    }
  }
}
