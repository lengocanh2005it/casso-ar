import { IsString, MinLength } from 'class-validator';

export class ExchangeTokenDto {
  @IsString()
  @MinLength(1)
  publicToken: string;
}
