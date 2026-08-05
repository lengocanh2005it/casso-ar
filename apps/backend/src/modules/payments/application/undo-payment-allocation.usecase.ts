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
  ) {}

  async execute(input: UndoPaymentAllocationInput): Promise<void> {
    await this.dataSource.transaction(async (manager: EntityManager) => {
      const allocation = await this.allocationRepo.findByIdForUpdate(
        input.allocationId,
        manager,
      );
      if (!allocation || !allocation.isActive()) {
        throw new Error('Payment allocation not found or already undone');
      }

      const payment = await this.paymentRepo.findByIdForUpdate(
        allocation.paymentId,
        manager,
      );
      const receivable = await this.receivableRepo.findByIdForUpdate(
        allocation.receivableId,
        manager,
      );
      if (!payment || !receivable) {
        throw new Error('Payment or receivable not found');
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
      await this.auditLogRepo.create(
        new AuditLog({
          organizationId: allocation.organizationId,
          userId: input.deletedByUserId,
          actionType: AuditActionType.PAYMENT_ALLOCATE_UNDO,
          entityType: AuditEntityType.PAYMENT_ALLOCATION,
          entityId: allocation.id,
          beforeState: { ...allocation },
          afterState: { ...undoneAllocation },
          ipAddress: null,
          createdAt: new Date(),
        }),
        manager,
      );
    });
  }
}
