import { Inject, Injectable } from '@nestjs/common';
import type { EmailTemplate } from '../domain/email-template';
import type { EmailTemplateAttachment } from '../domain/email-template-attachment';
import {
  EMAIL_TEMPLATE_ATTACHMENT_REPOSITORY,
  type IEmailTemplateAttachmentRepository,
} from './email-template-attachment-repository.port';
import {
  EMAIL_TEMPLATE_REPOSITORY,
  type IEmailTemplateRepository,
} from './email-template-repository.port';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export interface ListEmailTemplatesInput {
  page?: number;
  limit?: number;
}

export interface EmailTemplateWithAttachments {
  template: EmailTemplate;
  attachments: EmailTemplateAttachment[];
}

@Injectable()
export class ListEmailTemplatesUseCase {
  constructor(
    @Inject(EMAIL_TEMPLATE_REPOSITORY)
    private readonly templateRepo: IEmailTemplateRepository,
    @Inject(EMAIL_TEMPLATE_ATTACHMENT_REPOSITORY)
    private readonly attachmentRepo: IEmailTemplateAttachmentRepository,
  ) {}

  async execute(
    input: ListEmailTemplatesInput,
  ): Promise<EmailTemplateWithAttachments[]> {
    const page = input.page && input.page > 0 ? input.page : DEFAULT_PAGE;
    const limit =
      input.limit && input.limit > 0
        ? Math.min(input.limit, MAX_LIMIT)
        : DEFAULT_LIMIT;
    const templates = await this.templateRepo.findAllForOrganization({
      page,
      limit,
    });
    return Promise.all(
      templates.map(async (template) => ({
        template,
        attachments: await this.attachmentRepo.findAllByTemplateId(template.id),
      })),
    );
  }
}
