import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  EMAIL_TEMPLATE_REPOSITORY,
  type IEmailTemplateRepository,
} from './email-template-repository.port';
import {
  type EmailTemplateRenderData,
  RenderEmailTemplateUseCase,
  type RenderedEmail,
} from './render-email-template.usecase';

const SAMPLE_RENDER_DATA: EmailTemplateRenderData = {
  customerName: 'ABC Company Ltd.',
  invoiceNumber: 'INV-2026-0088',
  originalAmount: 50_000_000,
  remainingAmount: 20_000_000,
  dueDate: '2026-08-10',
  daysOverdue: 5,
  organizationName: 'Casso Ledger Demo',
};

@Injectable()
export class PreviewEmailTemplateUseCase {
  constructor(
    @Inject(EMAIL_TEMPLATE_REPOSITORY)
    private readonly templateRepo: IEmailTemplateRepository,
    private readonly renderUseCase: RenderEmailTemplateUseCase,
  ) {}

  async execute(id: string): Promise<RenderedEmail> {
    const template = await this.templateRepo.findById(id);
    if (!template) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy mẫu email.');
    }
    return this.renderUseCase.render(template, SAMPLE_RENDER_DATA);
  }
}
