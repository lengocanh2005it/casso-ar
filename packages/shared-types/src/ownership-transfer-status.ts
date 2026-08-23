export type OwnershipTransferStatus =
  | 'PENDING_OTP_CONFIRMATION'
  | 'PENDING_ACCEPTANCE'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'CANCELLED'
  | 'EXPIRED';
