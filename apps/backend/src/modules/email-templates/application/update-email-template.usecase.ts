import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import type { EmailTemplate } from '../domain/email-template';
import {
  EMAIL_TEMPLATE_REPOSITORY,
  type IEmailTemplateRepository,
} from './email-template-repository.port';

export interface UpdateEmailTemplateInput {
  id: string;
  subject?: string;
  bodyHtml?: string;
}

@Injectable()
export class UpdateEmailTemplateUseCase {
  constructor(
    @Inject(EMAIL_TEMPLATE_REPOSITORY)
    private readonly templateRepo: IEmailTemplateRepository,
  ) {}

  async execute(input: UpdateEmailTemplateInput): Promise<EmailTemplate> {
    const template = await this.templateRepo.findById(input.id);
    if (!template) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy mẫu email.');
    }

    const updated = template.updateContent(
      input.subject ?? template.subject,
      input.bodyHtml ?? template.bodyHtml,
    );
    await this.templateRepo.save(updated);
    return updated;
  }
}
