import { Inject, Injectable } from '@nestjs/common';
import {
  COLLECTION_ACTIVITY_REPOSITORY,
  ICollectionActivityRepository,
} from './collection-activity-repository.port';
import type { TimelinePage } from './get-receivable-timeline.usecase';

@Injectable()
export class GetCustomerTimelineUseCase {
  constructor(
    @Inject(COLLECTION_ACTIVITY_REPOSITORY)
    private readonly activityRepo: ICollectionActivityRepository,
  ) {}

  async execute(
    customerId: string,
    page: number,
    limit: number,
  ): Promise<TimelinePage> {
    const result = await this.activityRepo.findByCustomerId(
      customerId,
      page,
      limit,
    );
    return { ...result, page, limit };
  }
}
