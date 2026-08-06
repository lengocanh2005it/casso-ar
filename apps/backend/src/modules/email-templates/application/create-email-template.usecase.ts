import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { EmailTemplate } from '../domain/email-template';
import {
  EMAIL_TEMPLATE_REPOSITORY,
  type IEmailTemplateRepository,
} from './email-template-repository.port';

export interface CreateEmailTemplateInput {
  name: string;
  subject: string;
  bodyHtml: string;
  reminderStage: string | null;
}

@Injectable()
export class CreateEmailTemplateUseCase {
  constructor(
    @Inject(EMAIL_TEMPLATE_REPOSITORY)
    private readonly templateRepo: IEmailTemplateRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(input: CreateEmailTemplateInput): Promise<EmailTemplate> {
    const now = new Date();
    const template = new EmailTemplate({
      id: randomUUID(),
      organizationId: this.tenantContext.getOrganizationId(),
      name: input.name,
      subject: input.subject,
      bodyHtml: input.bodyHtml,
      reminderStage: input.reminderStage,
      isDefault: false,
      createdAt: now,
      updatedAt: now,
      version: 1,
    });

    await this.templateRepo.save(template);
    return template;
  }
}
