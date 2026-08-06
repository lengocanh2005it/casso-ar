import type { EntityManager } from 'typeorm';
import type { EmailTemplate } from '../domain/email-template';

export interface ListEmailTemplatesPagination {
  page: number;
  limit: number;
}

export interface IEmailTemplateRepository {
  findById(id: string): Promise<EmailTemplate | null>;
  findAllForOrganization(
    pagination: ListEmailTemplatesPagination,
  ): Promise<EmailTemplate[]>;
  save(template: EmailTemplate, manager?: EntityManager): Promise<void>;
  delete(id: string): Promise<void>;
  /**
   * Unscoped bulk insert — does NOT read organizationId from TenantContextService.
   * The only caller is DefaultOrganizationBootstrap's default-template seeding step
   * (auth module, Task 7 of this plan), which runs before any JWT/TenantContext exists for the
   * brand-new organization being created. Every other write path must use `save`.
   */
  saveMany(templates: EmailTemplate[], manager: EntityManager): Promise<void>;
}

export const EMAIL_TEMPLATE_REPOSITORY = Symbol('EMAIL_TEMPLATE_REPOSITORY');
