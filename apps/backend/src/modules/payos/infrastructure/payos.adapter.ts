import { Injectable } from '@nestjs/common';
import { NotFoundError, PayOS } from '@payos/node';
import type {
  CreatePaymentLinkInput,
  CreatePaymentLinkResult,
  IPayosPaymentAdapter,
  PayosPaymentLinkSnapshot,
} from '../application/payos-payment-adapter.port';

@Injectable()
export class PayosAdapter implements IPayosPaymentAdapter {
  private readonly client: PayOS;

  constructor() {
    this.client = new PayOS({
      clientId: process.env.PAYOS_CLIENT_ID ?? '',
      apiKey: process.env.PAYOS_API_KEY ?? '',
      checksumKey: process.env.PAYOS_CHECKSUM_KEY ?? '',
    });
  }

  async createPaymentLink(
    input: CreatePaymentLinkInput,
  ): Promise<CreatePaymentLinkResult> {
    const link = await this.client.paymentRequests.create({
      orderCode: input.orderCode,
      amount: input.amount,
      description: input.description,
      returnUrl: input.returnUrl,
      cancelUrl: input.cancelUrl,
    });
    return {
      checkoutUrl: link.checkoutUrl,
      orderCode: link.orderCode,
      paymentLinkId: link.paymentLinkId,
    };
  }

  async getPaymentLink(
    paymentLinkId: string,
  ): Promise<PayosPaymentLinkSnapshot | null> {
    try {
      const link = await this.client.paymentRequests.get(paymentLinkId);
      return {
        paymentLinkId: link.id,
        orderCode: link.orderCode,
        amount: link.amount,
        amountPaid: link.amountPaid,
        amountRemaining: link.amountRemaining,
        status: link.status,
        transactions: link.transactions.map((transaction) => ({
          reference: transaction.reference,
          amount: transaction.amount,
          transactionDateTime: transaction.transactionDateTime,
        })),
      };
    } catch (error) {
      if (error instanceof NotFoundError) return null;
      throw error;
    }
  }
}
