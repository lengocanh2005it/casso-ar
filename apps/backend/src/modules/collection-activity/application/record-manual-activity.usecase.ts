import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import {
  IReceivableRepository,
  RECEIVABLE_REPOSITORY,
} from '../../receivables/application/receivable-repository.port';
import {
  CollectionActivity,
  CollectionActivityType,
  MANUAL_ACTIVITY_TYPES,
  ManualActivityType,
} from '../domain/collection-activity';
import {
  COLLECTION_ACTIVITY_REPOSITORY,
  ICollectionActivityRepository,
} from './collection-activity-repository.port';

export interface RecordManualActivityInput {
  receivableId: string;
  activityType: ManualActivityType;
  description: string;
  createdByUserId: string;
}

@Injectable()
export class RecordManualActivityUseCase {
  constructor(
    @Inject(COLLECTION_ACTIVITY_REPOSITORY)
    private readonly activityRepo: ICollectionActivityRepository,
    @Inject(RECEIVABLE_REPOSITORY)
    private readonly receivableRepo: IReceivableRepository,
    private readonly tenantContext: TenantContextService,
    private readonly dataSource: DataSource,
  ) {}

  async execute(input: RecordManualActivityInput): Promise<CollectionActivity> {
    if (
      !(MANUAL_ACTIVITY_TYPES as readonly CollectionActivityType[]).includes(
        input.activityType,
      )
    ) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        `activityType phải là một trong các giá trị: ${MANUAL_ACTIVITY_TYPES.join(', ')}`,
      );
    }

    const receivable = await this.receivableRepo.findById(input.receivableId);
    if (!receivable) {
      throw new AppError(
        ErrorCode.RECEIVABLE_NOT_FOUND,
        'Không tìm thấy khoản phải thu.',
      );
    }

    const activity = new CollectionActivity({
      id: randomUUID(),
      organizationId: this.tenantContext.getOrganizationId(),
      receivableId: input.receivableId,
      customerId: receivable.customerId,
      activityType: input.activityType,
      description: input.description,
      metadata: {},
      createdByUserId: input.createdByUserId,
      createdAt: new Date(),
    });

    await this.dataSource.transaction(async (manager) => {
      await this.activityRepo.create(activity, manager);
    });
    return activity;
  }
}
