import type { OrganizationSmtpConfig } from '../../domain/organization-smtp-config';

export interface SmtpConfigResponseDto {
  host: string;
  port: number;
  username: string;
  fromAddress: string;
  status: string;
}

export function toSmtpConfigResponse(
  config: OrganizationSmtpConfig,
): SmtpConfigResponseDto {
  return {
    host: config.host,
    port: config.port,
    username: config.username,
    fromAddress: config.fromAddress,
    status: config.status,
  };
}
