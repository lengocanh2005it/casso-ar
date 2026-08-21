import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
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
    private readonly dataSource: DataSource,
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

    // Locks the EmailTemplate row for the transaction's duration so two
    // concurrent uploads to the same template can't both read the same
    // "existing" count/total and both pass the limit check — the second
    // waits for the lock, then re-reads the post-first-upload state.
    let savedStorageKey: string | undefined;
    let attachment!: EmailTemplateAttachment;
    try {
      await this.dataSource.transaction(async (manager) => {
        const template = await this.templateRepo.findByIdForUpdate(
          input.emailTemplateId,
          manager,
        );
        if (!template) {
          throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy mẫu email.');
        }

        const existing = await this.attachmentRepo.findAllByTemplateId(
          input.emailTemplateId,
          manager,
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
        savedStorageKey = storageKey;

        attachment = new EmailTemplateAttachment({
          id: randomUUID(),
          organizationId,
          emailTemplateId: input.emailTemplateId,
          filename: input.originalFilename,
          storageKey,
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
          createdAt: new Date(),
        });
        await this.attachmentRepo.save(attachment, manager);
      });
    } catch (error) {
      // The file may have been written to disk before a later check in the
      // same transaction failed (e.g. a concurrent upload won the race) —
      // clean it up since the DB row was never committed.
      if (savedStorageKey) {
        await this.storage.delete(savedStorageKey);
      }
      throw error;
    }

    return attachment;
  }
}
