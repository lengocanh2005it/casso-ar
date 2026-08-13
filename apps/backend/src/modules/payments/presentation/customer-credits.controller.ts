import { Permission } from '@casso-ledger/shared-types';
import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import type { CustomerCreditsResult } from '../application/get-customer-credits.usecase';
import { GetCustomerCreditsUseCase } from '../application/get-customer-credits.usecase';

@ApiTags('customer-credits')
@Controller('customers/:customerId/credits')
@UseGuards(PermissionGuard)
export class CustomerCreditsController {
  constructor(
    private readonly getCustomerCreditsUseCase: GetCustomerCreditsUseCase,
  ) {}

  @Get()
  @RequirePermission(Permission.RECEIVABLE_READ)
  async list(
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ): Promise<CustomerCreditsResult> {
    return this.getCustomerCreditsUseCase.execute({ customerId });
  }
}
