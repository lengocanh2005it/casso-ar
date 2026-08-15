import type { Dispute, DisputeStatus } from '../../domain/dispute';

export class DisputeResponseDto {
  id: string;
  receivableId: string;
  reason: string;
  status: DisputeStatus;
  createdAt: Date;
  resolvedAt: Date | null;
}

export function toDisputeResponse(dispute: Dispute): DisputeResponseDto {
  return {
    id: dispute.id,
    receivableId: dispute.receivableId,
    reason: dispute.reason,
    status: dispute.status,
    createdAt: dispute.createdAt,
    resolvedAt: dispute.resolvedAt,
  };
}
