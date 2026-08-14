import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../../common/errors/app-error';
import { ErrorCode } from '../../../../common/errors/error-code';
import {
  CUSTOMER_REPOSITORY,
  type ICustomerRepository,
} from '../../../customers/application/customer-repository.port';
import type { IReceivableRepository } from '../../../receivables/application/receivable-repository.port';
import { RECEIVABLE_REPOSITORY } from '../../../receivables/application/receivable-repository.port';
import type { CopilotJsonSchema } from '../copilot-tool-registry';
import {
  COPILOT_DRAFT_REPOSITORY,
  type ICopilotDraftRepository,
} from '../draft-repository.port';

export const DRAFT_REMINDER_EMAIL_SCHEMA: CopilotJsonSchema = {
  type: 'object',
  properties: {
    receivableId: {
      type: 'string',
      description: 'The receivable UUID to draft a reminder for',
    },
    tone: {
      type: 'string',
      enum: ['polite', 'urgent'],
      description: 'Tone of the reminder email; defaults to polite',
    },
  },
  required: ['receivableId'],
};

export interface DraftReminderEmailResult {
  draftId: string;
  receivableId: string;
  recipientEmail: string;
  subject: string;
  bodyHtml: string;
}

function formatVnd(amount: number): string {
  return `${amount.toLocaleString('vi-VN')} VND`;
}

// Customer-controlled values (name originates from CSV/Excel import) are
// interpolated into the draft's subject/bodyHtml, which is sent verbatim as an
// email — escape so a name like `<img src=x onerror=...>` cannot execute in
// HTML-rendering email clients (the Handlebars reminder path already escapes;
// this draft path must too).
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

@Injectable()
export class DraftReminderEmailTool {
  static readonly NAME = 'draftReminderEmail';

  constructor(
    @Inject(RECEIVABLE_REPOSITORY)
    private readonly receivableRepo: IReceivableRepository,
    @Inject(CUSTOMER_REPOSITORY)
    private readonly customerRepo: ICustomerRepository,
    @Inject(COPILOT_DRAFT_REPOSITORY)
    private readonly draftRepo: ICopilotDraftRepository,
  ) {}

  async execute(
    input: { receivableId: string; tone?: 'polite' | 'urgent' },
    organizationId: string,
    userId: string,
  ): Promise<DraftReminderEmailResult> {
    const receivable = await this.receivableRepo.findById(input.receivableId);
    if (!receivable) {
      throw new AppError(
        ErrorCode.RECEIVABLE_NOT_FOUND,
        'Không tìm thấy khoản phải thu.',
      );
    }
    if (receivable.organizationId !== organizationId) {
      throw new AppError(
        ErrorCode.TENANT_MISMATCH,
        'Khoản phải thu không thuộc tổ chức hiện tại.',
      );
    }

    const customer = await this.customerRepo.findById(receivable.customerId);
    if (!customer) {
      throw new AppError(
        ErrorCode.NOT_FOUND,
        'Không tìm thấy khách hàng của khoản phải thu này.',
      );
    }
    if (customer.organizationId !== organizationId) {
      throw new AppError(
        ErrorCode.TENANT_MISMATCH,
        'Khách hàng không thuộc tổ chức hiện tại.',
      );
    }

    const tone = input.tone ?? 'polite';
    const remaining = formatVnd(receivable.remainingAmount);
    const dueDate = receivable.dueDate.toISOString().slice(0, 10);
    const customerName = escapeHtml(customer.name);
    const subject =
      tone === 'urgent'
        ? `[Nhắc thanh toán khẩn] ${customerName} - còn lại ${remaining}`
        : `Nhắc thanh toán - ${customerName}`;
    const bodyHtml =
      tone === 'urgent'
        ? `<p>Kính gửi ${customerName},</p><p>Khoản phải thu đã quá hạn (hạn thanh toán: ${dueDate}). Số tiền còn lại: <strong>${remaining}</strong>. Vui lòng thanh toán sớm nhất có thể.</p>`
        : `<p>Kính gửi ${customerName},</p><p>Đây là thư nhắc về khoản phải thu đến hạn ngày ${dueDate}; số tiền còn lại là <strong>${remaining}</strong>. Cảm ơn.</p>`;

    const draftId = randomUUID();
    await this.draftRepo.save({
      id: draftId,
      organizationId,
      userId,
      receivableId: receivable.id,
      recipientEmail: customer.email,
      subject,
      bodyHtml,
      createdAt: new Date(),
    });

    return {
      draftId,
      receivableId: receivable.id,
      recipientEmail: customer.email,
      subject,
      bodyHtml,
    };
  }
}
