import { IsNotEmpty, IsString } from 'class-validator';

export class OpenDisputeDto {
  @IsString()
  @IsNotEmpty()
  reason: string;
}
