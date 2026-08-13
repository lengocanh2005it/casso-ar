import { Inject, Injectable } from '@nestjs/common';
import {
  COLLECTION_ACTIVITY_REPOSITORY,
  ICollectionActivityRepository,
} from './collection-activity-repository.port';
import type { TimelinePage } from './get-receivable-timeline.usecase';

@Injectable()
export class GetOrganizationTimelineUseCase {
  constructor(
    @Inject(COLLECTION_ACTIVITY_REPOSITORY)
    private readonly activityRepo: ICollectionActivityRepository,
  ) {}

  async execute(page: number, limit: number): Promise<TimelinePage> {
    const result = await this.activityRepo.findByOrganizationId(page, limit);
    return { ...result, page, limit };
  }
}
