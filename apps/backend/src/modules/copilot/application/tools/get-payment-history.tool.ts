import { Inject, Injectable } from '@nestjs/common';
import type { IPaymentAllocationRepository } from '../../../payments/application/payment-allocation-repository.port';
import { PAYMENT_ALLOCATION_REPOSITORY } from '../../../payments/application/payment-allocation-repository.port';
import type { PaymentAllocation } from '../../../payments/domain/payment-allocation';
import type { CopilotJsonSchema } from '../copilot-tool-registry';

export const GET_PAYMENT_HISTORY_SCHEMA: CopilotJsonSchema = {
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
export class GetPaymentHistoryTool {
  static readonly NAME = 'getPaymentHistory';

  constructor(
    @Inject(PAYMENT_ALLOCATION_REPOSITORY)
    private readonly allocationRepo: IPaymentAllocationRepository,
  ) {}

  async execute(input: {
    customerId: string;
    limit?: number;
  }): Promise<{ customerId: string; items: PaymentAllocation[] }> {
    const items = await this.allocationRepo.findByCustomerId(
      input.customerId,
      clampLimit(input.limit),
    );
    return { customerId: input.customerId, items };
  }
}
