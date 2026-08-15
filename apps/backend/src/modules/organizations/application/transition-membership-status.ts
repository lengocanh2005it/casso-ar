import type { DataSource, EntityManager } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import type { Membership, MembershipStatus } from '../domain/membership';
import type { IMembershipRepository } from './membership-repository.port';

interface TransitionMembershipStatusInput {
  dataSource: DataSource;
  membershipRepo: IMembershipRepository;
  userId: string;
  organizationId: string;
  targetStatus: MembershipStatus;
  notFoundMessage: string;
  validate?: (membership: Membership) => void;
  onChanged?: (membership: Membership, manager: EntityManager) => Promise<void>;
}

export async function transitionMembershipStatus(
  input: TransitionMembershipStatusInput,
): Promise<{ membership: Membership; changed: boolean }> {
  let changed = false;
  const membership = await input.dataSource.transaction(async (manager) => {
    const current = await input.membershipRepo.findByUserAndOrganization(
      input.userId,
      input.organizationId,
      manager,
    );
    if (!current) {
      throw new AppError(ErrorCode.NOT_FOUND, input.notFoundMessage);
    }

    input.validate?.(current);
    if (current.status === input.targetStatus) return current;

    changed = true;
    const transitioned =
      input.targetStatus === 'BLOCKED' ? current.block() : current.unblock();
    await input.membershipRepo.save(transitioned, manager);
    await input.onChanged?.(transitioned, manager);
    return transitioned;
  });

  return { membership, changed };
}
