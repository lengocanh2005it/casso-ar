import { Permission } from '@casso-ledger/shared-types';
import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ErrorCode } from '../../../common/errors/error-code';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { ApiErrorResponse } from '../../../common/swagger/api-error-response.decorator';
import { GetCustomerUseCase } from '../application/get-customer.usecase';
import { ListCustomersUseCase } from '../application/list-customers.usecase';
import {
  CustomerResponseDto,
  ListCustomersResponseDto,
  toCustomerResponse,
} from './dto/customer-response.dto';
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
  @ApiOperation({ summary: 'List customers with pagination and search' })
  @ApiOkResponse({ type: ListCustomersResponseDto })
  @ApiErrorResponse(ErrorCode.VALIDATION_ERROR)
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
  @ApiOperation({ summary: 'Get a customer by id' })
  @ApiOkResponse({ type: CustomerResponseDto })
  @ApiErrorResponse(ErrorCode.NOT_FOUND)
  @RequirePermission(Permission.CUSTOMER_READ)
  async get(@Param('id') id: string) {
    return toCustomerResponse(await this.getCustomer.execute(id));
  }
}
