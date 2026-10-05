import { Type } from 'class-transformer';
import {
  Allow,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class PayosWebhookDataDto {
  @IsNumber()
  orderCode: number;

  @Allow()
  amount: unknown;

  @IsString()
  description: string;

  @IsString()
  code: string;

  @IsString()
  desc: string;

  @IsString()
  @IsOptional()
  reference?: string;

  @IsString()
  @IsOptional()
  paymentLinkId?: string;

  @IsString()
  @IsOptional()
  transactionDateTime?: string;
}

export class PayosWebhookDto {
  @IsString()
  code: string;

  @IsString()
  desc: string;

  @IsBoolean()
  success: boolean;

  @ValidateNested()
  @Type(() => PayosWebhookDataDto)
  data: PayosWebhookDataDto;

  @IsString()
  signature: string;
}
