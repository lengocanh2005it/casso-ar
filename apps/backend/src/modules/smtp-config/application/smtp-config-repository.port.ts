import type { OrganizationSmtpConfig } from '../domain/organization-smtp-config';

export interface ISmtpConfigRepository {
  findByOrganizationId(
    organizationId: string,
  ): Promise<OrganizationSmtpConfig | null>;
  /** Upsert on organizationId — replaces any existing row. */
  save(config: OrganizationSmtpConfig): Promise<void>;
  deleteByOrganizationId(organizationId: string): Promise<void>;
}

export const SMTP_CONFIG_REPOSITORY = Symbol('SMTP_CONFIG_REPOSITORY');
