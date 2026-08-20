import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class ConnectCassoFlowDto {
  @IsString()
  @MinLength(1)
  apiKey: string;

  @IsOptional()
  @IsUUID()
  bankConnectionId?: string;
}
