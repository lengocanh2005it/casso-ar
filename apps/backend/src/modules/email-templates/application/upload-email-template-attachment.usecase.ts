import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { EmailTemplateAttachment } from '../domain/email-template-attachment';
import {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  MAX_ATTACHMENT_COUNT,
  MAX_ATTACHMENT_SIZE_BYTES,
  MAX_TOTAL_ATTACHMENT_SIZE_BYTES,
} from './attachment-limits';
import {
  ATTACHMENT_STORAGE,
  type IAttachmentStorage,
} from './attachment-storage.port';
import {
  EMAIL_TEMPLATE_ATTACHMENT_REPOSITORY,
  type IEmailTemplateAttachmentRepository,
} from './email-template-attachment-repository.port';
import {
  EMAIL_TEMPLATE_REPOSITORY,
  type IEmailTemplateRepository,
} from './email-template-repository.port';

export interface UploadEmailTemplateAttachmentInput {
  emailTemplateId: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  buffer: Buffer;
}

@Injectable()
export class UploadEmailTemplateAttachmentUseCase {
  constructor(
    @Inject(EMAIL_TEMPLATE_REPOSITORY)
    private readonly templateRepo: IEmailTemplateRepository,
    @Inject(EMAIL_TEMPLATE_ATTACHMENT_REPOSITORY)
    private readonly attachmentRepo: IEmailTemplateAttachmentRepository,
    @Inject(ATTACHMENT_STORAGE)
    private readonly storage: IAttachmentStorage,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(
    input: UploadEmailTemplateAttachmentInput,
  ): Promise<EmailTemplateAttachment> {
    if (
      !ALLOWED_ATTACHMENT_MIME_TYPES.includes(
        input.mimeType as (typeof ALLOWED_ATTACHMENT_MIME_TYPES)[number],
      )
    ) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'Định dạng file không hợp lệ (chỉ chấp nhận PDF, PNG, JPEG)',
      );
    }
    if (input.sizeBytes > MAX_ATTACHMENT_SIZE_BYTES) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'File quá lớn (tối đa 10MB mỗi file)',
      );
    }

    const organizationId = this.tenantContext.getOrganizationId();
    const template = await this.templateRepo.findById(input.emailTemplateId);
    if (!template) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy mẫu email.');
    }

    const existing = await this.attachmentRepo.findAllByTemplateId(
      input.emailTemplateId,
    );
    if (existing.length >= MAX_ATTACHMENT_COUNT) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        `Đã đạt số lượng file đính kèm tối đa (${MAX_ATTACHMENT_COUNT} file).`,
      );
    }
    const existingTotal = existing.reduce((sum, a) => sum + a.sizeBytes, 0);
    if (existingTotal + input.sizeBytes > MAX_TOTAL_ATTACHMENT_SIZE_BYTES) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'Tổng dung lượng file đính kèm vượt quá 25MB.',
      );
    }

    const storageKey = await this.storage.save(
      organizationId,
      input.emailTemplateId,
      input.originalFilename,
      input.buffer,
    );

    const attachment = new EmailTemplateAttachment({
      id: randomUUID(),
      organizationId,
      emailTemplateId: input.emailTemplateId,
      filename: input.originalFilename,
      storageKey,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      createdAt: new Date(),
    });
    await this.attachmentRepo.save(attachment);
    return attachment;
  }
}
