import { Inject, Injectable } from '@nestjs/common';
import type { EmailTemplate } from '../domain/email-template';
import {
  type ITemplateCompiler,
  TEMPLATE_COMPILER,
} from './template-compiler.port';

export interface EmailTemplateRenderData {
  customerName: string;
  invoiceNumber: string;
  originalAmount: number;
  remainingAmount: number;
  dueDate: string;
  daysOverdue: number;
  organizationName: string;
}

export interface RenderedEmail {
  subject: string;
  bodyHtml: string;
}

@Injectable()
export class RenderEmailTemplateUseCase {
  constructor(
    @Inject(TEMPLATE_COMPILER)
    private readonly templateCompiler: ITemplateCompiler,
  ) {}

  render(
    template: EmailTemplate,
    data: EmailTemplateRenderData,
  ): RenderedEmail {
    const subject = this.templateCompiler.compile(template.subject, {
      ...data,
    });
    const bodyHtml = this.templateCompiler.compile(template.bodyHtml, {
      ...data,
    });
    return { subject, bodyHtml };
  }
}
