import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  ATTACHMENT_STORAGE,
  type IAttachmentStorage,
} from './attachment-storage.port';
import {
  EMAIL_TEMPLATE_ATTACHMENT_REPOSITORY,
  type IEmailTemplateAttachmentRepository,
} from './email-template-attachment-repository.port';

@Injectable()
export class DeleteEmailTemplateAttachmentUseCase {
  constructor(
    @Inject(EMAIL_TEMPLATE_ATTACHMENT_REPOSITORY)
    private readonly attachmentRepo: IEmailTemplateAttachmentRepository,
    @Inject(ATTACHMENT_STORAGE)
    private readonly storage: IAttachmentStorage,
  ) {}

  async execute(emailTemplateId: string, attachmentId: string): Promise<void> {
    const attachment = await this.attachmentRepo.findById(attachmentId);
    if (!attachment || attachment.emailTemplateId !== emailTemplateId) {
      throw new AppError(
        ErrorCode.ATTACHMENT_NOT_FOUND,
        'Không tìm thấy file đính kèm.',
      );
    }

    await this.storage.delete(attachment.storageKey);
    await this.attachmentRepo.delete(attachmentId);
  }
}
