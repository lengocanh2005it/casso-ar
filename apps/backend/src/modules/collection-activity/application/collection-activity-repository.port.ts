import { CollectionActivity } from '../domain/collection-activity';

export interface ICollectionActivityRepository {
  create(activity: CollectionActivity): Promise<void>;
  findByReceivableId(receivableId: string): Promise<CollectionActivity[]>;
  findByCustomerId(customerId: string): Promise<CollectionActivity[]>;
}

export const COLLECTION_ACTIVITY_REPOSITORY = Symbol(
  'COLLECTION_ACTIVITY_REPOSITORY',
);
