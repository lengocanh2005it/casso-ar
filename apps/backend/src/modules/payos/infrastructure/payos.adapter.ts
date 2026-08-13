import { Injectable } from '@nestjs/common';
import { PayOS } from '@payos/node';
import type {
  CreatePaymentLinkInput,
  CreatePaymentLinkResult,
  IPayosPaymentAdapter,
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
    return { checkoutUrl: link.checkoutUrl, orderCode: link.orderCode };
  }
}
