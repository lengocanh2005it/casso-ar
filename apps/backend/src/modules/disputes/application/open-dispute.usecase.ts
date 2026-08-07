import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  EVENT_PUBLISHER,
  type IEventPublisher,
} from '../../../common/events/event-publisher.port';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import {
  type IReceivableRepository,
  RECEIVABLE_REPOSITORY,
} from '../../receivables/application/receivable-repository.port';
import { Dispute, DisputeStatus } from '../domain/dispute';
import {
  DISPUTE_REPOSITORY,
  type IDisputeRepository,
} from './dispute-repository.port';

export interface OpenDisputeInput {
  receivableId: string;
  reason: string;
  openedByUserId: string;
}

@Injectable()
export class OpenDisputeUseCase {
  constructor(
    @Inject(DISPUTE_REPOSITORY)
    private readonly disputeRepo: IDisputeRepository,
    @Inject(RECEIVABLE_REPOSITORY)
    private readonly receivableRepo: IReceivableRepository,
    private readonly dataSource: DataSource,
    private readonly tenantContext: TenantContextService,
    @Inject(EVENT_PUBLISHER)
    private readonly eventPublisher: IEventPublisher,
  ) {}

  async execute(input: OpenDisputeInput): Promise<Dispute> {
    const dispute = await this.dataSource.transaction(
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

        const existing = await this.disputeRepo.findOpenDispute(
          input.receivableId,
          manager,
        );
        if (existing) {
          throw new AppError(
            ErrorCode.DISPUTE_ALREADY_OPEN,
            'Khoản phải thu đã có tranh chấp đang mở.',
          );
        }

        const dispute = new Dispute({
          id: randomUUID(),
          organizationId: this.tenantContext.getOrganizationId(),
          receivableId: input.receivableId,
          reason: input.reason,
          status: DisputeStatus.OPEN,
          openedByUserId: input.openedByUserId,
          resolvedByUserId: null,
          resolvedAt: null,
          createdAt: new Date(),
          version: 1,
        });

        await this.disputeRepo.save(dispute, manager);
        return dispute;
      },
    );

    this.eventPublisher.emit('dispute.opened', {
      disputeId: dispute.id,
      receivableId: dispute.receivableId,
      organizationId: dispute.organizationId,
    });

    return dispute;
  }
}
