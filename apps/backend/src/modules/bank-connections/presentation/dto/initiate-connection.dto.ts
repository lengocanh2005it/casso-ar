import { IsOptional, IsUUID } from 'class-validator';

export class InitiateConnectionDto {
  @IsOptional()
  @IsUUID()
  bankConnectionId?: string;
}
