import { Inject, Injectable } from '@nestjs/common';
import { CollectionActivity } from '../domain/collection-activity';
import {
  COLLECTION_ACTIVITY_REPOSITORY,
  ICollectionActivityRepository,
} from './collection-activity-repository.port';

export interface TimelinePage {
  items: CollectionActivity[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class GetReceivableTimelineUseCase {
  constructor(
    @Inject(COLLECTION_ACTIVITY_REPOSITORY)
    private readonly activityRepo: ICollectionActivityRepository,
  ) {}

  async execute(
    receivableId: string,
    page: number,
    limit: number,
  ): Promise<TimelinePage> {
    const result = await this.activityRepo.findByReceivableId(
      receivableId,
      page,
      limit,
    );
    return { ...result, page, limit };
  }
}
