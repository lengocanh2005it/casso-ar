import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { Dispute } from '../domain/dispute';
import { DisputeNotOpenError } from '../domain/dispute';
import {
  DISPUTE_REPOSITORY,
  type IDisputeRepository,
} from './dispute-repository.port';
import { EVENT_PUBLISHER, type IEventPublisher } from './event-publisher.port';

export interface ResolveDisputeInput {
  disputeId: string;
  resolvedByUserId: string;
}

@Injectable()
export class ResolveDisputeUseCase {
  constructor(
    @Inject(DISPUTE_REPOSITORY)
    private readonly disputeRepo: IDisputeRepository,
    private readonly dataSource: DataSource,
    private readonly tenantContext: TenantContextService,
    @Inject(EVENT_PUBLISHER)
    private readonly eventPublisher: IEventPublisher,
  ) {}

  async execute(input: ResolveDisputeInput) {
    const resolved = await this.dataSource.transaction(
      async (manager: EntityManager) => {
        const dispute = await this.disputeRepo.findByIdForUpdate(
          input.disputeId,
          manager,
        );
        if (!dispute) {
          throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy tranh chấp.');
        }

        let updated: Dispute;
        try {
          updated = dispute.resolve(input.resolvedByUserId);
        } catch (error) {
          if (error instanceof DisputeNotOpenError) {
            throw new AppError(
              ErrorCode.CONFLICT,
              'Tranh chấp đã được giải quyết.',
            );
          }
          throw error;
        }

        await this.disputeRepo.save(updated, manager);
        return updated;
      },
    );

    this.eventPublisher.emit('dispute.resolved', {
      disputeId: resolved.id,
      receivableId: resolved.receivableId,
      organizationId: this.tenantContext.getOrganizationId(),
    });

    return resolved;
  }
}
