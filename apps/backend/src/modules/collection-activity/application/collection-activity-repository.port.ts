import type { EntityManager } from 'typeorm';
import { CollectionActivity } from '../domain/collection-activity';

export interface CollectionActivityPage {
  items: CollectionActivity[];
  total: number;
}

export interface ICollectionActivityRepository {
  create(activity: CollectionActivity, manager?: EntityManager): Promise<void>;
  findByReceivableId(
    receivableId: string,
    page: number,
    limit: number,
  ): Promise<CollectionActivityPage>;
  findByCustomerId(
    customerId: string,
    page: number,
    limit: number,
  ): Promise<CollectionActivityPage>;
  findByOrganizationId(
    page: number,
    limit: number,
  ): Promise<CollectionActivityPage>;
  deleteOlderThan(cutoff: Date): Promise<number>;
}

export const COLLECTION_ACTIVITY_REPOSITORY = Symbol(
  'COLLECTION_ACTIVITY_REPOSITORY',
);
