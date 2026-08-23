import { ApiProperty } from '@nestjs/swagger';
import type { OwnershipTransferStatus } from '@casso-ledger/shared-types';
import type { OwnershipTransferRequest } from '../../../ownership-transfer/domain/ownership-transfer-request';

export class OwnershipTransferResponseDto {
  @ApiProperty({ description: 'The unique ID of the ownership transfer request' })
  id: string;

  @ApiProperty({ description: 'The current status of the request', example: 'PENDING_OTP_CONFIRMATION' })
  status: OwnershipTransferStatus;

  @ApiProperty({ description: 'The user ID of the current owner who initiated the request' })
  fromUserId: string;

  @ApiProperty({ description: 'The user ID of the target who will become the new owner' })
  toUserId: string;

  @ApiProperty({ description: 'The date and time when the acceptance window expires, if applicable' })
  acceptanceExpiresAt: string | null;

  @ApiProperty({ description: 'The date and time when the request was created' })
  createdAt: string;
}

export function toOwnershipTransferResponse(
  request: OwnershipTransferRequest,
): OwnershipTransferResponseDto {
  return {
    id: request.id,
    status: request.status,
    fromUserId: request.fromUserId,
    toUserId: request.toUserId,
    acceptanceExpiresAt: request.acceptanceExpiresAt?.toISOString() ?? null,
    createdAt: request.createdAt.toISOString(),
  };
}
