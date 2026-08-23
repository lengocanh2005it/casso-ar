import type { EntityManager } from 'typeorm';
import type { OwnershipTransferRequest } from '../domain/ownership-transfer-request';
import type { IOwnershipTransferRequestRepository } from './ownership-transfer-request-repository.port';

// ADR-0015-style lazy reclaim: a request past its current stage's TTL is
// flipped to EXPIRED the next time anything touches it (create/view/confirm/
// cancel/accept/decline), not by a cron. Called from inside the caller's
// write transaction so the flip is atomic with whatever check follows it.
export async function reclaimIfExpired(
  repo: IOwnershipTransferRequestRepository,
  request: OwnershipTransferRequest,
  manager: EntityManager,
): Promise<OwnershipTransferRequest> {
  if (!request.isExpired()) return request;
  const expired = request.expire();
  await repo.save(expired, manager);
  return expired;
}
