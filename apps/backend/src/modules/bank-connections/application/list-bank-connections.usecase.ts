import { Inject, Injectable } from '@nestjs/common';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import {
  BANK_CONNECTION_REPOSITORY,
  type IBankConnectionRepository,
} from './bank-connection-repository.port';

@Injectable()
export class ListBankConnectionsUseCase {
  constructor(
    @Inject(BANK_CONNECTION_REPOSITORY)
    private readonly bankConnectionRepo: IBankConnectionRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(page: number, limit: number) {
    const organizationId = this.tenantContext.getOrganizationId();
    const [items, total] = await Promise.all([
      this.bankConnectionRepo.findPage(organizationId, page, limit),
      this.bankConnectionRepo.count(organizationId),
    ]);
    return { items, total, page, limit };
  }
}
