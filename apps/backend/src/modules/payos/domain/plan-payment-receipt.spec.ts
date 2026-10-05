import { decidePlanPaymentReceiptOutcome } from './plan-payment-receipt';

describe('plan payment receipt outcome', () => {
  it('accepts only an exact quoted amount with verified identity and current eligibility', () => {
    expect(
      decidePlanPaymentReceiptOutcome({
        receivedAmount: 299000,
        quotedAmount: 299000,
        hasVerifiedTransferIdentity: true,
        isEligible: true,
      }),
    ).toBe('ACCEPTED');
  });

  it.each([
    ['invalid amount', null, 299000, true, true],
    ['unknown quote', 299000, null, true, true],
    ['amount mismatch', 298000, 299000, true, true],
    ['unknown transfer identity', 299000, 299000, false, true],
    ['ineligible payment', 299000, 299000, true, false],
  ])(
    'requires review for %s',
    (_reason, receivedAmount, quotedAmount, hasIdentity, isEligible) => {
      expect(
        decidePlanPaymentReceiptOutcome({
          receivedAmount,
          quotedAmount,
          hasVerifiedTransferIdentity: hasIdentity,
          isEligible,
        }),
      ).toBe('REVIEW_REQUIRED');
    },
  );

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '299000'])(
    'requires review for invalid received amount %p',
    (receivedAmount) => {
      expect(
        decidePlanPaymentReceiptOutcome({
          receivedAmount,
          quotedAmount: 299000,
          hasVerifiedTransferIdentity: true,
          isEligible: true,
        }),
      ).toBe('REVIEW_REQUIRED');
    },
  );
});
