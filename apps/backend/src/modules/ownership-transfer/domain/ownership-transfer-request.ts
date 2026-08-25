import type { OwnershipTransferStatus } from '@casso-ar/shared-types';

export type { OwnershipTransferStatus };

export interface OwnershipTransferRequestProps {
  id: string;
  organizationId: string;
  fromUserId: string;
  toUserId: string;
  status: OwnershipTransferStatus;
  otpHash: string;
  otpExpiresAt: Date;
  acceptanceExpiresAt: Date | null;
  resolvedAt: Date | null;
  createdAt: Date;
}

export class OwnershipTransferRequest {
  readonly id: string;
  readonly organizationId: string;
  readonly fromUserId: string;
  readonly toUserId: string;
  readonly status: OwnershipTransferStatus;
  readonly otpHash: string;
  readonly otpExpiresAt: Date;
  readonly acceptanceExpiresAt: Date | null;
  readonly resolvedAt: Date | null;
  readonly createdAt: Date;

  constructor(props: OwnershipTransferRequestProps) {
    this.id = props.id;
    this.organizationId = props.organizationId;
    this.fromUserId = props.fromUserId;
    this.toUserId = props.toUserId;
    this.status = props.status;
    this.otpHash = props.otpHash;
    this.otpExpiresAt = props.otpExpiresAt;
    this.acceptanceExpiresAt = props.acceptanceExpiresAt;
    this.resolvedAt = props.resolvedAt;
    this.createdAt = props.createdAt;
  }

  isNonTerminal(): boolean {
    return (
      this.status === 'PENDING_OTP_CONFIRMATION' ||
      this.status === 'PENDING_ACCEPTANCE'
    );
  }

  isOtpExpired(now: Date = new Date()): boolean {
    return (
      this.status === 'PENDING_OTP_CONFIRMATION' && now > this.otpExpiresAt
    );
  }

  isAcceptanceExpired(now: Date = new Date()): boolean {
    return (
      this.status === 'PENDING_ACCEPTANCE' &&
      this.acceptanceExpiresAt !== null &&
      now > this.acceptanceExpiresAt
    );
  }

  isExpired(now: Date = new Date()): boolean {
    return this.isOtpExpired(now) || this.isAcceptanceExpired(now);
  }

  confirm(acceptanceExpiresAt: Date): OwnershipTransferRequest {
    return new OwnershipTransferRequest({
      ...this,
      status: 'PENDING_ACCEPTANCE',
      acceptanceExpiresAt,
    });
  }

  accept(): OwnershipTransferRequest {
    return new OwnershipTransferRequest({
      ...this,
      status: 'ACCEPTED',
      resolvedAt: new Date(),
    });
  }

  decline(): OwnershipTransferRequest {
    return new OwnershipTransferRequest({
      ...this,
      status: 'DECLINED',
      resolvedAt: new Date(),
    });
  }

  cancel(): OwnershipTransferRequest {
    return new OwnershipTransferRequest({
      ...this,
      status: 'CANCELLED',
      resolvedAt: new Date(),
    });
  }

  expire(): OwnershipTransferRequest {
    return new OwnershipTransferRequest({
      ...this,
      status: 'EXPIRED',
      resolvedAt: new Date(),
    });
  }
}
