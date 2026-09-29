import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { Role } from '../../organizations/domain/membership';
import {
  CUSTOMER_REPOSITORY,
  type ICustomerRepository,
} from './customer-repository.port';

@Injectable()
export class GetCustomerUseCase {
  constructor(
    @Inject(CUSTOMER_REPOSITORY)
    private readonly customerRepo: ICustomerRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(id: string) {
    const user = this.tenantContext.getCurrentUser();
    const customer =
      user?.role === Role.SALES_REP
        ? await this.customerRepo.findByIdForSalesRep(id, user.userId)
        : await this.customerRepo.findById(id);
    if (!customer) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy khách hàng.');
    }
    return customer;
  }
}
