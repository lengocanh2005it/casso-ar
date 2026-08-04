import { randomUUID } from 'node:crypto';
import { ReceivableStatus } from '@casso-ledger/shared-types';
import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
// biome-ignore lint/style/useImportType: must be a value import — NestJS DI resolves this constructor param via emitDecoratorMetadata's design:paramtypes, which erases type-only imports to `Function`
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { Receivable } from '../domain/receivable';
import {
  type IReceivableRepository,
  RECEIVABLE_REPOSITORY,
} from './receivable-repository.port';

@Injectable()
export class CreateReceivableUseCase {
  constructor(
    @Inject(RECEIVABLE_REPOSITORY) private readonly repo: IReceivableRepository,
    private readonly tenant: TenantContextService,
  ) {}

  async execute(
    input: {
      customerId: string;
      invoiceId: string | null;
      originalAmount: number;
      dueDate: Date;
      salesRepresentativeId: string | null;
    },
    manager?: EntityManager,
  ): Promise<Receivable> {
    const receivable = {
      id: randomUUID(),
      organizationId: this.tenant.getOrganizationId(),
      ...input,
      paidAmount: 0,
      status: ReceivableStatus.OPEN,
      createdAt: new Date(),
      closedAt: null,
    } as Receivable;
    await this.repo.save(receivable, manager);
    return receivable;
  }
}
