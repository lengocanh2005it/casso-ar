import { Permission } from '@casso-ledger/shared-types';
import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ErrorCode } from '../../../common/errors/error-code';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { ApiErrorResponse } from '../../../common/swagger/api-error-response.decorator';
import { GetCustomerCreditsUseCase } from '../application/get-customer-credits.usecase';
import { CustomerCreditsResponseDto } from './dto/customer-credits-response.dto';

@ApiTags('customer-credits')
@Controller('customers/:customerId/credits')
@UseGuards(PermissionGuard)
export class CustomerCreditsController {
  constructor(
    private readonly getCustomerCreditsUseCase: GetCustomerCreditsUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List unallocated payment credits for a customer' })
  @ApiOkResponse({ type: CustomerCreditsResponseDto })
  @ApiErrorResponse(ErrorCode.VALIDATION_ERROR, ErrorCode.NOT_FOUND)
  @RequirePermission(Permission.RECEIVABLE_READ)
  async list(
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ): Promise<CustomerCreditsResponseDto> {
    return this.getCustomerCreditsUseCase.execute({ customerId });
  }
}
