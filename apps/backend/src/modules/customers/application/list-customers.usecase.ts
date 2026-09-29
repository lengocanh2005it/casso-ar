import { Inject, Injectable } from '@nestjs/common';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { Role } from '../../organizations/domain/membership';
import type { Customer } from '../domain/customer';
import {
  CUSTOMER_REPOSITORY,
  type ICustomerRepository,
} from './customer-repository.port';

export interface ListCustomersInput {
  search?: string;
  page: number;
  limit: number;
}

export interface ListCustomersOutput {
  items: Customer[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class ListCustomersUseCase {
  constructor(
    @Inject(CUSTOMER_REPOSITORY)
    private readonly customerRepo: ICustomerRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(input: ListCustomersInput): Promise<ListCustomersOutput> {
    const organizationId = this.tenantContext.getOrganizationId();
    const user = this.tenantContext.getCurrentUser();
    const salesRepresentativeId =
      user?.role === Role.SALES_REP ? user.userId : undefined;
    const { search, page, limit } = input;

    const [items, total] = await Promise.all([
      this.customerRepo.findPage(
        organizationId,
        search,
        page,
        limit,
        salesRepresentativeId,
      ),
      this.customerRepo.count(organizationId, search, salesRepresentativeId),
    ]);

    return { items, total, page, limit };
  }
}
