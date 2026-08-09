import { Permission } from '@casso-ledger/shared-types';
import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { GetCustomerUseCase } from '../application/get-customer.usecase';
import { ListCustomersUseCase } from '../application/list-customers.usecase';
import { toCustomerResponse } from './dto/customer-response.dto';

@Controller('customers')
@UseGuards(PermissionGuard)
export class CustomersController {
  constructor(
    private readonly listCustomers: ListCustomersUseCase,
    private readonly getCustomer: GetCustomerUseCase,
  ) {}

  @Get()
  @RequirePermission(Permission.CUSTOMER_READ)
  async list(
    @Query() pagination: PaginationDto,
    @Query('search') search?: string,
  ) {
    const result = await this.listCustomers.execute({
      search,
      page: pagination.page,
      limit: pagination.limit,
    });
    return {
      items: result.items.map(toCustomerResponse),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  @Get(':id')
  @RequirePermission(Permission.CUSTOMER_READ)
  async get(@Param('id') id: string) {
    return toCustomerResponse(await this.getCustomer.execute(id));
  }
}
