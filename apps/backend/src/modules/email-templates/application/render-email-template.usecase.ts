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

/** Template values after formatting: money is a readable string, not an integer. */
type TemplateVariables = Omit<
  EmailTemplateRenderData,
  'originalAmount' | 'remainingAmount'
> & {
  originalAmount: string;
  remainingAmount: string;
};

function formatVnd(amount: number): string {
  return `${amount.toLocaleString('vi-VN')} ₫`;
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
    const formatted: TemplateVariables = {
      ...data,
      // Customers must never see raw VND integers (20000000) in an email.
      originalAmount: formatVnd(data.originalAmount),
      remainingAmount: formatVnd(data.remainingAmount),
    };
    const subject = this.templateCompiler.compile(template.subject, {
      ...formatted,
    });
    const bodyHtml = this.templateCompiler.compile(template.bodyHtml, {
      ...formatted,
    });
    return { subject, bodyHtml };
  }
}
