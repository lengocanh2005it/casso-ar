import type { Dispute } from '../../domain/dispute';

export interface DisputeResponseDto {
  id: string;
  receivableId: string;
  reason: string;
  status: Dispute['status'];
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
