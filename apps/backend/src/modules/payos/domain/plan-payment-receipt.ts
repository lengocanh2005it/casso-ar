import { PlanPaymentReceiptOutcome } from '@casso-ar/shared-types';

export interface PlanPaymentReceiptDecisionInput {
  receivedAmount: unknown;
  quotedAmount: number | null;
  hasVerifiedTransferIdentity: boolean;
  isEligible: boolean;
}

export function decidePlanPaymentReceiptOutcome(
  input: PlanPaymentReceiptDecisionInput,
): PlanPaymentReceiptOutcome {
  if (
    typeof input.receivedAmount !== 'number' ||
    !Number.isSafeInteger(input.receivedAmount) ||
    input.receivedAmount <= 0 ||
    input.quotedAmount === null ||
    !Number.isSafeInteger(input.quotedAmount) ||
    input.quotedAmount <= 0 ||
    input.receivedAmount !== input.quotedAmount ||
    !input.hasVerifiedTransferIdentity ||
    !input.isEligible
  ) {
    return PlanPaymentReceiptOutcome.REVIEW_REQUIRED;
  }

  return PlanPaymentReceiptOutcome.ACCEPTED;
}
