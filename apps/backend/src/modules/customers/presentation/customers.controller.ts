import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { Permission } from '../../../common/rbac/permission.enum';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { ListCustomersUseCase } from '../application/list-customers.usecase';

@Controller('customers')
@UseGuards(PermissionGuard)
export class CustomersController {
  constructor(private readonly listCustomers: ListCustomersUseCase) {}

  @Get()
  @RequirePermission(Permission.CUSTOMER_READ)
  async list(
    @Query() pagination: PaginationDto,
    @Query('search') search?: string,
  ) {
    return this.listCustomers.execute({
      search,
      page: pagination.page,
      limit: pagination.limit,
    });
  }
}
