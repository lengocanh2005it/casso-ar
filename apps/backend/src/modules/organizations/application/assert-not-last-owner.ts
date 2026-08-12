import type { EntityManager } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import type { Membership } from '../domain/membership';
import { Role } from '../domain/membership';
import type { IMembershipRepository } from './membership-repository.port';

// Shared by role-change and member-removal: never demote or remove the last
// active OWNER of an organization. Called from inside the write transaction;
// `manager` is required so the owner count is read with a row lock on the
// same connection, closing the TOCTOU window between two concurrent removals.
export async function assertNotLastOwner(
  membershipRepo: IMembershipRepository,
  organizationId: string,
  membership: Membership,
  manager: EntityManager,
): Promise<void> {
  if (membership.role !== Role.OWNER) return;
  const ownerCount = await membershipRepo.countActiveByRole(
    organizationId,
    Role.OWNER,
    manager,
  );
  if (ownerCount <= 1) {
    throw new AppError(
      ErrorCode.CONFLICT,
      'Không thể gỡ hoặc hạ quyền OWNER cuối cùng của tổ chức.',
    );
  }
}
