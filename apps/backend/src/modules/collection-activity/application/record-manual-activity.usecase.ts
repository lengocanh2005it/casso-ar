import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
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
  ) {}

  async execute(input: RecordManualActivityInput): Promise<CollectionActivity> {
    if (
      !(MANUAL_ACTIVITY_TYPES as readonly CollectionActivityType[]).includes(
        input.activityType,
      )
    ) {
      throw new Error(
        `activityType must be one of ${MANUAL_ACTIVITY_TYPES.join(', ')}`,
      );
    }

    const receivable = await this.receivableRepo.findById(input.receivableId);
    if (!receivable) {
      throw new Error('Receivable not found');
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

    await this.activityRepo.create(activity);
    return activity;
  }
}
