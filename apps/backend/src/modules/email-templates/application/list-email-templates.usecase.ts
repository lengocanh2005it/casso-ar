import { Inject, Injectable } from '@nestjs/common';
import type { EmailTemplate } from '../domain/email-template';
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

@Injectable()
export class ListEmailTemplatesUseCase {
  constructor(
    @Inject(EMAIL_TEMPLATE_REPOSITORY)
    private readonly templateRepo: IEmailTemplateRepository,
  ) {}

  async execute(input: ListEmailTemplatesInput): Promise<EmailTemplate[]> {
    const page = input.page && input.page > 0 ? input.page : DEFAULT_PAGE;
    const limit =
      input.limit && input.limit > 0
        ? Math.min(input.limit, MAX_LIMIT)
        : DEFAULT_LIMIT;
    return this.templateRepo.findAllForOrganization({ page, limit });
  }
}
