import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import {
  EMAIL_TEMPLATE_REPOSITORY,
  type IEmailTemplateRepository,
} from '../../email-templates/application/email-template-repository.port';
import { buildDefaultEmailTemplates } from '../../email-templates/application/seed-default-email-templates';
import type { IOrganizationBootstrap } from '../application/organization-bootstrap.port';

@Injectable()
export class DefaultOrganizationBootstrap implements IOrganizationBootstrap {
  constructor(
    @Inject(EMAIL_TEMPLATE_REPOSITORY)
    private readonly templateRepo: IEmailTemplateRepository,
  ) {}

  async seed(organizationId: string, manager: EntityManager): Promise<void> {
    const templates = buildDefaultEmailTemplates(organizationId, new Date());
    await this.templateRepo.saveMany(templates, manager);
    // ponytail: reminder-rule seeding (Plan #12) not implemented yet; this
    // adapter will be extended to also seed default reminder policies/rules.
  }
}
