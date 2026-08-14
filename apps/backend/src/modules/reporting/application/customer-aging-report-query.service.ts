import { Inject, Injectable } from '@nestjs/common';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import {
  CUSTOMER_AGING_REPORT_REPOSITORY,
  type CustomerAgingFilters,
  type CustomerAgingPage,
  type ICustomerAgingReportRepository,
} from './customer-aging-report.repository.port';

@Injectable()
export class CustomerAgingReportQueryService {
  constructor(
    @Inject(CUSTOMER_AGING_REPORT_REPOSITORY)
    private readonly customerAgingReportRepo: ICustomerAgingReportRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  getCustomerAging(filters: CustomerAgingFilters): Promise<CustomerAgingPage> {
    const organizationId = this.tenantContext.getOrganizationId();
    return this.customerAgingReportRepo.findPage(organizationId, filters);
  }
}
