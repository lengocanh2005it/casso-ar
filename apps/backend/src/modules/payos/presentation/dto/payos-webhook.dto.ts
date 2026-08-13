export class PayosWebhookDataDto {
  orderCode: number;
  amount: number;
  description: string;
  code: string;
  desc: string;
  reference?: string;
}

export class PayosWebhookDto {
  code: string;
  desc: string;
  success: boolean;
  data: PayosWebhookDataDto;
  signature: string;
}
