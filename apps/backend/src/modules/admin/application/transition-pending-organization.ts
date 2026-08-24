import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import type { IMembershipRepository } from '../../organizations/application/membership-repository.port';
import type { IOrganizationRepository } from '../../organizations/application/organization-repository.port';
import type { Organization } from '../../organizations/domain/organization';
import type { IUserRepository } from '../../users/application/user-repository.port';
import {
  type OperatorActionType,
  OperatorAuditLog,
  type OrganizationVerificationMethod,
} from '../domain/operator-audit-log';
import type { IOperatorAuditLogRepository } from './operator-audit-log-repository.port';

export interface TransitionPendingOrganizationInput {
  dataSource: DataSource;
  organizationRepo: IOrganizationRepository;
  auditRepo: IOperatorAuditLogRepository;
  membershipRepo: IMembershipRepository;
  userRepo: IUserRepository;
  organizationId: string;
  operatorId: string;
  actionType: OperatorActionType;
  reason?: string;
  verificationMethod?: OrganizationVerificationMethod;
  transition: (organization: Organization) => Organization;
  notify: (ownerEmail: string, organizationName: string) => Promise<void>;
}

/**
 * Shared shape behind ApproveOrganizationUseCase/RejectOrganizationUseCase: load a
 * PENDING_REVIEW organization, transition + audit it in one transaction, then notify
 * the owner. Hoists organizationName out of the transaction instead of a second
 * findById — the in-transaction fetch already has it.
 */
export async function transitionPendingOrganization(
  input: TransitionPendingOrganizationInput,
): Promise<void> {
  let organizationName = '';
  await input.dataSource.transaction(async (manager) => {
    const organization = await input.organizationRepo.findById(
      input.organizationId,
      manager,
    );
    if (!organization) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy tổ chức.');
    }
    if (organization.status !== 'PENDING_REVIEW') {
      throw new AppError(
        ErrorCode.CONFLICT,
        'Tổ chức không ở trạng thái chờ duyệt.',
      );
    }
    organizationName = organization.name;

    await input.organizationRepo.save(input.transition(organization), manager);
    await input.auditRepo.save(
      new OperatorAuditLog({
        id: randomUUID(),
        operatorId: input.operatorId,
        organizationId: input.organizationId,
        actionType: input.actionType,
        reason: input.reason,
        verificationMethod: input.verificationMethod,
        createdAt: new Date(),
      }),
      manager,
    );
  });

  const owner = await input.membershipRepo.findOwnerByOrganization(
    input.organizationId,
  );
  if (!owner) return;
  const ownerUser = await input.userRepo.findById(owner.userId);
  if (!ownerUser) return;
  await input.notify(ownerUser.email, organizationName);
}
