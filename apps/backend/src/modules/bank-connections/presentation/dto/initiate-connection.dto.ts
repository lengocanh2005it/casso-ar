import { IsOptional, IsUrl, IsUUID } from 'class-validator';

export class InitiateConnectionDto {
  @IsUrl({ require_tld: false })
  redirectUri: string;

  @IsOptional()
  @IsUUID()
  bankConnectionId?: string;
}
