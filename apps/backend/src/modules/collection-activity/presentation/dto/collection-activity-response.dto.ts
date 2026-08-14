import type {
  CollectionActivity,
  CollectionActivityType,
} from '../../domain/collection-activity';

export class CollectionActivityResponseDto {
  id: string;
  receivableId: string;
  customerId: string;
  activityType: CollectionActivityType;
  description: string;
  metadata: Record<string, unknown>;
  createdByUserId: string | null;
  createdAt: Date;
}

export class CollectionActivityPageResponseDto {
  items: CollectionActivityResponseDto[];
  total: number;
  page: number;
  limit: number;
}

export function toCollectionActivityResponse(
  activity: CollectionActivity,
): CollectionActivityResponseDto {
  return {
    id: activity.id,
    receivableId: activity.receivableId,
    customerId: activity.customerId,
    activityType: activity.activityType,
    description: activity.description,
    metadata: activity.metadata,
    createdByUserId: activity.createdByUserId,
    createdAt: activity.createdAt,
  };
}
