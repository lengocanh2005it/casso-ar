import { randomUUID } from 'node:crypto';
import { ReceivableStatus } from '@casso-ledger/shared-types';
import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { TenantContextService } from '../../../common/tenancy/tenant-context';
import { Receivable } from '../domain/receivable';
import {
  type IReceivableRepository,
  RECEIVABLE_REPOSITORY,
} from './receivable-repository.port';

export interface CreateReceivableInput {
  customerId: string;
  invoiceId: string | null;
  originalAmount: number;
  dueDate: Date;
  salesRepresentativeId: string | null;
}

@Injectable()
export class CreateReceivableUseCase {
  constructor(
    @Inject(RECEIVABLE_REPOSITORY)
    private readonly receivableRepo: IReceivableRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(
    input: CreateReceivableInput,
    manager?: EntityManager,
  ): Promise<Receivable> {
    const receivable = new Receivable({
      id: randomUUID(),
      organizationId: this.tenantContext.getOrganizationId(),
      customerId: input.customerId,
      invoiceId: input.invoiceId,
      originalAmount: input.originalAmount,
      paidAmount: 0,
      dueDate: input.dueDate,
      status: ReceivableStatus.OPEN,
      salesRepresentativeId: input.salesRepresentativeId,
      createdAt: new Date(),
      closedAt: null,
    });
    await this.receivableRepo.save(receivable, manager);
    return receivable;
  }
}
