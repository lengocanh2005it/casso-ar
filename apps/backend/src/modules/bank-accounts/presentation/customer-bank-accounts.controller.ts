import { Permission } from '@casso-ledger/shared-types';
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
  AuditActionType,
  AuditEntityType,
} from '../../../common/audit/audit.enums';
import { Audited } from '../../../common/audit/audited.decorator';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { CreateCustomerBankAccountUseCase } from '../application/create-customer-bank-account.usecase';
import { DeactivateCustomerBankAccountUseCase } from '../application/deactivate-customer-bank-account.usecase';
import { ListCustomerBankAccountsUseCase } from '../application/list-customer-bank-accounts.usecase';
import { UpdateCustomerBankAccountUseCase } from '../application/update-customer-bank-account.usecase';
import {
  CreateCustomerBankAccountDto,
  UpdateCustomerBankAccountDto,
} from './customer-bank-account.dto';
import { toCustomerBankAccountResponse } from './customer-bank-account.mapper';

@Controller('customers/:customerId/bank-accounts')
@UseGuards(PermissionGuard)
export class CustomerBankAccountsController {
  constructor(
    private readonly listUseCase: ListCustomerBankAccountsUseCase,
    private readonly createUseCase: CreateCustomerBankAccountUseCase,
    private readonly updateUseCase: UpdateCustomerBankAccountUseCase,
    private readonly deactivateUseCase: DeactivateCustomerBankAccountUseCase,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Get()
  @RequirePermission(Permission.RECEIVABLE_READ)
  async list(@Param('customerId', ParseUUIDPipe) customerId: string) {
    const result = await this.listUseCase.execute({ customerId });
    return {
      items: result.items.map(toCustomerBankAccountResponse),
      total: result.total,
    };
  }

  @Post()
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
    return this.idempotency.execute(
      `POST /customers/${customerId}/bank-accounts`,
      key,
      dto,
      async () =>
        toCustomerBankAccountResponse(
          await this.createUseCase.execute({
            customerId,
            accountNumber: dto.accountNumber,
          }),
        ),
    );
  }

  @Patch(':id')
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
          await this.updateUseCase.execute({ id, customerId, ...dto }),
        ),
    );
  }

  @Delete(':id')
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
