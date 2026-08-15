import { randomUUID } from 'node:crypto';
import { ReceivableStatus } from '@casso-ledger/shared-types';
import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { PlanLimitService } from '../../billing/application/plan-limit.service';
import {
  CUSTOMER_REPOSITORY,
  type ICustomerRepository,
} from '../../customers/application/customer-repository.port';
import { ReceivableBalanceHistoryRecorderService } from '../../receivable-balance-history/application/receivable-balance-history-recorder.service';
import { BalanceHistoryActorType } from '../../receivable-balance-history/domain/balance-history-actor-type';
import { BalanceHistoryChangeSource } from '../../receivable-balance-history/domain/balance-history-change-source';
import { Receivable } from '../domain/receivable';
import {
  type IReceivableRepository,
  RECEIVABLE_REPOSITORY,
} from './receivable-repository.port';

export interface CreateReceivableInput {
  customerId: string;
  invoiceId: string | null;
  originalAmount: number;
  dueDate: Date;
  salesRepresentativeId: string | null;
}

@Injectable()
export class CreateReceivableUseCase {
  constructor(
    @Inject(RECEIVABLE_REPOSITORY) private readonly repo: IReceivableRepository,
    @Inject(CUSTOMER_REPOSITORY)
    private readonly customerRepo: ICustomerRepository,
    private readonly tenant: TenantContextService,
    private readonly planLimit: PlanLimitService,
    private readonly dataSource: DataSource,
    private readonly historyRecorder: ReceivableBalanceHistoryRecorderService,
  ) {}

  async execute(
    input: CreateReceivableInput,
    manager?: EntityManager,
  ): Promise<Receivable> {
    if (manager) return this.createWithinTransaction(input, manager);

    return this.dataSource.transaction((transactionManager) =>
      this.createWithinTransaction(input, transactionManager),
    );
  }

  private async createWithinTransaction(
    input: CreateReceivableInput,
    manager: EntityManager,
  ): Promise<Receivable> {
    // customerRepo.findById is tenant-scoped (BaseRepository), so a customer
    // belonging to a different organization resolves to null here — this is
    // what prevents a receivable from being created against another tenant's customer.
    const customer = await this.customerRepo.findById(
      input.customerId,
      manager,
    );
    if (!customer) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Khách hàng không tồn tại');
    }

    // Plan-limit check and the insert must share one transaction so two
    // concurrent requests can't both squeeze past a limit with one slot left.
    await this.planLimit.enforceReceivableLimit(manager);

    const receivable = new Receivable({
      id: randomUUID(),
      organizationId: this.tenant.getOrganizationId(),
      ...input,
      paidAmount: 0,
      status: ReceivableStatus.OPEN,
      createdAt: new Date(),
      closedAt: null,
      version: 0,
    });
    await this.repo.save(receivable, manager);
    const user = this.tenant.getCurrentUser();
    if (!user) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Yêu cầu đăng nhập.');
    }
    await this.historyRecorder.record({
      receivable,
      changeSource: BalanceHistoryChangeSource.CREATE,
      provenance: {
        actorType: BalanceHistoryActorType.USER,
        actorUserId: user.userId,
      },
      manager,
    });
    return receivable;
  }
}
