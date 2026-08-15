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
import { ReceivableBalanceHistoryRecorderService } from '../../receivable-balance-history/application/receivable-balance-history-recorder.service';
import { BalanceHistoryActorType } from '../../receivable-balance-history/domain/balance-history-actor-type';
import { BalanceHistoryChangeSource } from '../../receivable-balance-history/domain/balance-history-change-source';
import type { Receivable } from '../domain/receivable';
import {
  type IReceivableRepository,
  RECEIVABLE_REPOSITORY,
} from './receivable-repository.port';

@Injectable()
export class CancelReceivableUseCase {
  constructor(
    @Inject(RECEIVABLE_REPOSITORY)
    private readonly receivableRepo: IReceivableRepository,
    private readonly dataSource: DataSource,
    private readonly auditContext: AuditContextService,
    @Inject(EVENT_PUBLISHER)
    private readonly eventPublisher: IEventPublisher,
    private readonly historyRecorder: ReceivableBalanceHistoryRecorderService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(receivableId: string): Promise<Receivable> {
    const updated = await this.dataSource.transaction(
      async (manager: EntityManager) => {
        const receivable = await this.receivableRepo.findByIdForUpdate(
          receivableId,
          manager,
        );
        if (!receivable) {
          throw new AppError(
            ErrorCode.RECEIVABLE_NOT_FOUND,
            'Không tìm thấy khoản phải thu.',
          );
        }
        if (receivable.paidAmount > 0) {
          throw new AppError(
            ErrorCode.RECEIVABLE_HAS_PAYMENTS,
            'Không thể hủy khoản phải thu đã nhận thanh toán.',
          );
        }

        this.auditContext.setBefore(receivable);
        let next: Receivable;
        try {
          next = receivable.cancel();
        } catch (error) {
          throw new AppError(
            ErrorCode.CONFLICT,
            error instanceof Error
              ? error.message
              : 'Không thể hủy khoản phải thu.',
          );
        }
        await this.receivableRepo.save(next, manager);
        const user = this.tenantContext.getCurrentUser();
        if (!user) {
          throw new AppError(ErrorCode.UNAUTHORIZED, 'Yêu cầu đăng nhập.');
        }
        await this.historyRecorder.record({
          receivable: next,
          changeSource: BalanceHistoryChangeSource.CANCEL,
          provenance: {
            actorType: BalanceHistoryActorType.USER,
            actorUserId: user.userId,
          },
          manager,
        });
        return next;
      },
    );

    await this.eventPublisher.emitAsync('receivable.status-closed', {
      receivableId: updated.id,
      organizationId: updated.organizationId,
    });
    return updated;
  }
}
