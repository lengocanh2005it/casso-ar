import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class PayosWebhookDataDto {
  @IsNumber()
  orderCode: number;

  @IsNumber()
  amount: number;

  @IsString()
  description: string;

  @IsString()
  code: string;

  @IsString()
  desc: string;

  @IsString()
  @IsOptional()
  reference?: string;
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
