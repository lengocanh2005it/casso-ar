import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  type IOrganizationRepository,
  ORGANIZATION_REPOSITORY,
} from '../../organizations/application/organization-repository.port';
import { OperatorAuditLog } from '../domain/operator-audit-log';
import {
  type IOperatorAuditLogRepository,
  OPERATOR_AUDIT_LOG_REPOSITORY,
} from './operator-audit-log-repository.port';

export interface LockOrganizationInput {
  organizationId: string;
  operatorId: string;
}

@Injectable()
export class LockOrganizationUseCase {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepo: IOrganizationRepository,
    @Inject(OPERATOR_AUDIT_LOG_REPOSITORY)
    private readonly auditRepo: IOperatorAuditLogRepository,
  ) {}

  async execute(input: LockOrganizationInput): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const organization = await this.organizationRepo.findById(
        input.organizationId,
        manager,
      );
      if (!organization) {
        throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy tổ chức.');
      }
      if (organization.status === 'LOCKED') return;

      await this.organizationRepo.save(organization.lock(), manager);
      await this.auditRepo.save(
        new OperatorAuditLog({
          id: randomUUID(),
          operatorId: input.operatorId,
          organizationId: input.organizationId,
          actionType: 'ORGANIZATION_LOCKED',
          createdAt: new Date(),
        }),
        manager,
      );
    });
  }
}
