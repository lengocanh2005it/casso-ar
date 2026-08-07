import { Inject, Injectable } from '@nestjs/common';
import { CollectionActivity } from '../domain/collection-activity';
import {
  COLLECTION_ACTIVITY_REPOSITORY,
  ICollectionActivityRepository,
} from './collection-activity-repository.port';

@Injectable()
export class GetCustomerTimelineUseCase {
  constructor(
    @Inject(COLLECTION_ACTIVITY_REPOSITORY)
    private readonly activityRepo: ICollectionActivityRepository,
  ) {}

  async execute(customerId: string): Promise<CollectionActivity[]> {
    return this.activityRepo.findByCustomerId(customerId);
  }
}
