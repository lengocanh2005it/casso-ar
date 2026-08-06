import { Injectable } from '@nestjs/common';
import * as Handlebars from 'handlebars';
import { EmailTemplate } from '../domain/email-template';

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
  render(
    template: EmailTemplate,
    data: EmailTemplateRenderData,
  ): RenderedEmail {
    const subject = Handlebars.compile(template.subject)(data);
    const bodyHtml = Handlebars.compile(template.bodyHtml)(data);
    return { subject, bodyHtml };
  }
}
