import { Inject, Injectable } from '@nestjs/common';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { Role } from '../../organizations/domain/membership';
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
    const user = this.tenantContext.getCurrentUser();
    if (user?.role === Role.SALES_REP) {
      return this.customerAgingReportRepo.findPage(
        organizationId,
        filters,
        user.userId,
      );
    }
    return this.customerAgingReportRepo.findPage(organizationId, filters);
  }
}
