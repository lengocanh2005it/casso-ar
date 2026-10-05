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
  paymentLinkId: string;
}

export interface PayosPaymentLinkSnapshot {
  paymentLinkId: string;
  orderCode: number;
  amount: number;
  amountPaid: number;
  amountRemaining: number;
  status: string;
  transactions: Array<{
    reference: string;
    amount: number;
    transactionDateTime: string;
  }>;
}

export interface IPayosPaymentAdapter {
  createPaymentLink(
    input: CreatePaymentLinkInput,
  ): Promise<CreatePaymentLinkResult>;
  getPaymentLink(
    paymentLinkId: string,
  ): Promise<PayosPaymentLinkSnapshot | null>;
}

export const PAYOS_PAYMENT_ADAPTER = Symbol('PAYOS_PAYMENT_ADAPTER');
