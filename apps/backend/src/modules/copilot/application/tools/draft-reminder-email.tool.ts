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
import { sanitizeEmailHtml } from '../sanitize-email-html';

const MAX_SUBJECT_LENGTH = 200;
const MAX_BODY_HTML_LENGTH = 20_000;

export const DRAFT_REMINDER_EMAIL_SCHEMA: CopilotJsonSchema = {
  type: 'object',
  properties: {
    receivableId: {
      type: 'string',
      description: 'The receivable UUID to draft a reminder for',
    },
    subject: {
      type: 'string',
      maxLength: MAX_SUBJECT_LENGTH,
      description:
        'The email subject line, written in Vietnamese, based on real receivable data',
    },
    bodyHtml: {
      type: 'string',
      maxLength: MAX_BODY_HTML_LENGTH,
      description:
        'The email body as HTML, written in Vietnamese, using the real remaining amount and due date from a prior read tool call',
    },
  },
  required: ['receivableId', 'subject', 'bodyHtml'],
};

export interface DraftReminderEmailResult {
  draftId: string;
  receivableId: string;
  recipientEmail: string;
  subject: string;
  bodyHtml: string;
}

export interface DraftReminderEmailInput {
  receivableId: string;
  subject: string;
  bodyHtml: string;
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
    input: DraftReminderEmailInput,
    organizationId: string,
    userId: string,
  ): Promise<DraftReminderEmailResult> {
    if (!input.subject || input.subject.length > MAX_SUBJECT_LENGTH) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        `Tiêu đề email phải có từ 1 đến ${MAX_SUBJECT_LENGTH} ký tự.`,
      );
    }
    if (!input.bodyHtml || input.bodyHtml.length > MAX_BODY_HTML_LENGTH) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        `Nội dung email phải có từ 1 đến ${MAX_BODY_HTML_LENGTH} ký tự.`,
      );
    }

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

    const subject = input.subject.trim();
    const bodyHtml = sanitizeEmailHtml(input.bodyHtml);
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
