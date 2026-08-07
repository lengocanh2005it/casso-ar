import { Inject, Injectable } from '@nestjs/common';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { CustomerResponseDto } from '../presentation/dto/customer-response.dto';
import { toCustomerResponse } from '../presentation/dto/customer-response.dto';
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
  items: CustomerResponseDto[];
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
    const { search, page, limit } = input;

    const [customers, total] = await Promise.all([
      this.customerRepo.findPage(organizationId, search, page, limit),
      this.customerRepo.count(organizationId, search),
    ]);

    return {
      items: customers.map(toCustomerResponse),
      total,
      page,
      limit,
    };
  }
}
