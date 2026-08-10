import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  CUSTOMER_REPOSITORY,
  type ICustomerRepository,
} from './customer-repository.port';

@Injectable()
export class GetCustomerUseCase {
  constructor(
    @Inject(CUSTOMER_REPOSITORY)
    private readonly customerRepo: ICustomerRepository,
  ) {}

  async execute(id: string) {
    const customer = await this.customerRepo.findById(id);
    if (!customer) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy khách hàng.');
    }
    return customer;
  }
}
