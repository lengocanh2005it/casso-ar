import { Injectable } from '@nestjs/common';
import { GetCustomerTimelineUseCase } from '../../../collection-activity/application/get-customer-timeline.usecase';
import type { CollectionActivity } from '../../../collection-activity/domain/collection-activity';
import type { CopilotJsonSchema } from '../copilot-tool-registry';

export const GET_COLLECTION_ACTIVITY_TIMELINE_SCHEMA: CopilotJsonSchema = {
  type: 'object',
  properties: {
    customerId: { type: 'string' },
    limit: { type: 'integer', minimum: 1, maximum: 50 },
  },
  required: ['customerId'],
};

const MIN_LIMIT = 1;
const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;

function clampLimit(limit: number | undefined): number {
  const value =
    limit === undefined || !Number.isFinite(limit)
      ? DEFAULT_LIMIT
      : Math.trunc(limit);
  return Math.min(Math.max(value, MIN_LIMIT), MAX_LIMIT);
}

@Injectable()
export class GetCollectionActivityTimelineTool {
  static readonly NAME = 'getCollectionActivityTimeline';

  constructor(
    private readonly getCustomerTimeline: GetCustomerTimelineUseCase,
  ) {}

  async execute(input: {
    customerId: string;
    limit?: number;
  }): Promise<{ customerId: string; items: CollectionActivity[] }> {
    const items = await this.getCustomerTimeline.execute(
      input.customerId,
      clampLimit(input.limit),
    );
    return { customerId: input.customerId, items };
  }
}
