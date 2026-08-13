export interface CreatePaymentLinkInput {
  orderCode: number;
  amount: number;
  description: string;
  returnUrl: string;
  cancelUrl: string;
}

export interface CreatePaymentLinkResult {
  checkoutUrl: string;
  orderCode: number;
}

export interface IPayosPaymentAdapter {
  createPaymentLink(
    input: CreatePaymentLinkInput,
  ): Promise<CreatePaymentLinkResult>;
}

export const PAYOS_PAYMENT_ADAPTER = Symbol('PAYOS_PAYMENT_ADAPTER');
