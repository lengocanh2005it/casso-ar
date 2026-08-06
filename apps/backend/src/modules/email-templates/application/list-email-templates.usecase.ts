import { Inject, Injectable } from '@nestjs/common';
import type { EmailTemplate } from '../domain/email-template';
import {
  EMAIL_TEMPLATE_REPOSITORY,
  type IEmailTemplateRepository,
} from './email-template-repository.port';

@Injectable()
export class ListEmailTemplatesUseCase {
  constructor(
    @Inject(EMAIL_TEMPLATE_REPOSITORY)
    private readonly templateRepo: IEmailTemplateRepository,
  ) {}

  async execute(): Promise<EmailTemplate[]> {
    return this.templateRepo.findAllForOrganization();
  }
}
