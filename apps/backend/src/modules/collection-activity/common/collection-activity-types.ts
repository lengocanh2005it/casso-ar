/**
 * Shared enum for collection activity types. Lives in common/ so both
 * domain/ (CollectionActivity entity) and infrastructure/ (ORM entity)
 * can import it without crossing layer boundaries.
 */
export enum CollectionActivityType {
  INVOICE_CREATED = 'INVOICE_CREATED',
  EMAIL_SENT = 'EMAIL_SENT',
  EMAIL_FAILED = 'EMAIL_FAILED',
  PAYMENT_RECEIVED = 'PAYMENT_RECEIVED',
  RECEIVABLE_CLOSED = 'RECEIVABLE_CLOSED',
  DISPUTE_OPENED = 'DISPUTE_OPENED',
  DISPUTE_RESOLVED = 'DISPUTE_RESOLVED',
  MANUAL_CALL = 'MANUAL_CALL',
  MANUAL_NOTE = 'MANUAL_NOTE',
  PAYMENT_COMMITMENT = 'PAYMENT_COMMITMENT',
}

export const MANUAL_ACTIVITY_TYPES = [
  CollectionActivityType.MANUAL_CALL,
  CollectionActivityType.MANUAL_NOTE,
  CollectionActivityType.PAYMENT_COMMITMENT,
] as const;

export type ManualActivityType = (typeof MANUAL_ACTIVITY_TYPES)[number];
