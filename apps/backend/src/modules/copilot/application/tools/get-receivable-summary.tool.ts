import { Inject, Injectable } from '@nestjs/common';
import type { IReceivableRepository } from '../../../receivables/application/receivable-repository.port';
import { RECEIVABLE_REPOSITORY } from '../../../receivables/application/receivable-repository.port';
import type { CopilotJsonSchema } from '../copilot-tool-registry';

export const GET_RECEIVABLE_SUMMARY_SCHEMA: CopilotJsonSchema = {
  type: 'object',
  properties: {
    customerId: {
      type: 'string',
      description: 'The customer UUID to summarize',
    },
  },
  required: ['customerId'],
};

export interface ReceivableSummaryDto {
  customerId: string;
  totalOutstanding: number;
  totalOverdue: number;
  overdueCount: number;
  maxOverdueDays: number;
  averageLateDays: number;
}

@Injectable()
export class GetReceivableSummaryTool {
  static readonly NAME = 'getReceivableSummary';

  constructor(
    @Inject(RECEIVABLE_REPOSITORY)
    private readonly receivableRepo: IReceivableRepository,
  ) {}

  async execute(
    input: { customerId: string },
    now = new Date(),
  ): Promise<ReceivableSummaryDto> {
    const receivables = await this.receivableRepo.findOpenByCustomerId(
      input.customerId,
    );
    const overdue = receivables.filter((receivable) =>
      receivable.isOverdue(now),
    );
    const lateDays = overdue.map((receivable) =>
      Math.floor(
        (now.getTime() - receivable.dueDate.getTime()) / (24 * 60 * 60 * 1000),
      ),
    );

    return {
      customerId: input.customerId,
      totalOutstanding: receivables.reduce(
        (sum, receivable) => sum + receivable.remainingAmount,
        0,
      ),
      totalOverdue: overdue.reduce(
        (sum, receivable) => sum + receivable.remainingAmount,
        0,
      ),
      overdueCount: overdue.length,
      maxOverdueDays: lateDays.length ? Math.max(...lateDays) : 0,
      averageLateDays: lateDays.length
        ? Math.round(
            lateDays.reduce((sum, days) => sum + days, 0) / lateDays.length,
          )
        : 0,
    };
  }
}
