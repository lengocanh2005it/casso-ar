import { Permission } from '@casso-ledger/shared-types';
import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { GetCustomerUseCase } from '../application/get-customer.usecase';
import { ListCustomersUseCase } from '../application/list-customers.usecase';
import { toCustomerResponse } from './dto/customer-response.dto';
import { ListCustomersQueryDto } from './dto/list-customers-query.dto';

@ApiTags('customers')
@Controller('customers')
@UseGuards(PermissionGuard)
export class CustomersController {
  constructor(
    private readonly listCustomers: ListCustomersUseCase,
    private readonly getCustomer: GetCustomerUseCase,
  ) {}

  @Get()
  @RequirePermission(Permission.CUSTOMER_READ)
  async list(@Query() query: ListCustomersQueryDto) {
    const result = await this.listCustomers.execute({
      search: query.search,
      page: query.page,
      limit: query.limit,
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
