import { Permission } from '@casso-ar/shared-types';
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  AuditActionType,
  AuditEntityType,
} from '../../../common/audit/audit.enums';
import { Audited } from '../../../common/audit/audited.decorator';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { ApiErrorResponse } from '../../../common/swagger/api-error-response.decorator';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { CreateCustomerBankAccountUseCase } from '../application/create-customer-bank-account.usecase';
import { DeactivateCustomerBankAccountUseCase } from '../application/deactivate-customer-bank-account.usecase';
import { ListCustomerBankAccountsUseCase } from '../application/list-customer-bank-accounts.usecase';
import { UpdateCustomerBankAccountUseCase } from '../application/update-customer-bank-account.usecase';
import {
  CreateCustomerBankAccountDto,
  UpdateCustomerBankAccountDto,
} from './customer-bank-account.dto';
import {
  CustomerBankAccountResponseDto,
  ListCustomerBankAccountsResponseDto,
  toCustomerBankAccountResponse,
} from './customer-bank-account-response.dto';

@ApiTags('customer-bank-accounts')
@Controller('customers/:customerId/bank-accounts')
@UseGuards(PermissionGuard)
export class CustomerBankAccountsController {
  constructor(
    private readonly listUseCase: ListCustomerBankAccountsUseCase,
    private readonly createUseCase: CreateCustomerBankAccountUseCase,
    private readonly updateUseCase: UpdateCustomerBankAccountUseCase,
    private readonly deactivateUseCase: DeactivateCustomerBankAccountUseCase,
    private readonly idempotency: IdempotencyService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List bank accounts of a customer' })
  @ApiOkResponse({ type: ListCustomerBankAccountsResponseDto })
  @ApiErrorResponse(ErrorCode.VALIDATION_ERROR, ErrorCode.NOT_FOUND)
  @RequirePermission(Permission.RECEIVABLE_READ)
  async list(@Param('customerId', ParseUUIDPipe) customerId: string) {
    const result = await this.listUseCase.execute({ customerId });
    return {
      items: result.items.map(toCustomerBankAccountResponse),
      total: result.total,
    };
  }

  @Post()
  @ApiOperation({ summary: 'Create a bank account for a customer' })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiCreatedResponse({ type: CustomerBankAccountResponseDto })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.NOT_FOUND,
    ErrorCode.CONFLICT,
    ErrorCode.IDEMPOTENCY_KEY_REUSED,
  )
  @RequirePermission(Permission.CUSTOMER_BANK_ACCOUNT_MANAGE)
  @Audited(
    AuditActionType.CUSTOMER_BANK_ACCOUNT_CREATE,
    AuditEntityType.CUSTOMER_BANK_ACCOUNT,
  )
  async create(
    @Headers('idempotency-key') key: string | undefined,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body() dto: CreateCustomerBankAccountDto,
  ) {
    const user = this.tenantContext.getCurrentUser();
    if (!user) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Yêu cầu đăng nhập.');
    }
    return this.idempotency.execute(
      `POST /customers/${customerId}/bank-accounts`,
      key,
      dto,
      async () =>
        toCustomerBankAccountResponse(
          await this.createUseCase.execute({
            customerId,
            accountNumber: dto.accountNumber,
            acknowledgeExistingLinks: dto.acknowledgeExistingLinks,
            confirmedByUserId: user.userId,
          }),
        ),
    );
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a customer bank account' })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiOkResponse({ type: CustomerBankAccountResponseDto })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.NOT_FOUND,
    ErrorCode.CONFLICT,
    ErrorCode.IDEMPOTENCY_KEY_REUSED,
  )
  @RequirePermission(Permission.CUSTOMER_BANK_ACCOUNT_MANAGE)
  @Audited(
    AuditActionType.CUSTOMER_BANK_ACCOUNT_UPDATE,
    AuditEntityType.CUSTOMER_BANK_ACCOUNT,
  )
  async update(
    @Headers('idempotency-key') key: string | undefined,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerBankAccountDto,
  ) {
    return this.idempotency.execute(
      `PATCH /customers/${customerId}/bank-accounts/${id}`,
      key,
      dto,
      async () =>
        toCustomerBankAccountResponse(
          await this.updateUseCase.execute({
            id,
            customerId,
            ...dto,
            confirmedByUserId: this.tenantContext.getCurrentUser()?.userId,
          }),
        ),
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Deactivate a customer bank account' })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiNoContentResponse({ description: 'Bank account deactivated' })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.NOT_FOUND,
    ErrorCode.IDEMPOTENCY_KEY_REUSED,
  )
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(Permission.CUSTOMER_BANK_ACCOUNT_MANAGE)
  @Audited(
    AuditActionType.CUSTOMER_BANK_ACCOUNT_DEACTIVATE,
    AuditEntityType.CUSTOMER_BANK_ACCOUNT,
  )
  async deactivate(
    @Headers('idempotency-key') key: string | undefined,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.idempotency.execute(
      `DELETE /customers/${customerId}/bank-accounts/${id}`,
      key,
      { id },
      async () =>
        toCustomerBankAccountResponse(
          await this.deactivateUseCase.execute({ id, customerId }),
        ),
    );
  }
}
