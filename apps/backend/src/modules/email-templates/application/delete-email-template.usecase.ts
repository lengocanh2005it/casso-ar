import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
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
import {
  EMAIL_TEMPLATE_REPOSITORY,
  type IEmailTemplateRepository,
} from './email-template-repository.port';

@Injectable()
export class DeleteEmailTemplateUseCase {
  constructor(
    @Inject(EMAIL_TEMPLATE_REPOSITORY)
    private readonly templateRepo: IEmailTemplateRepository,
    private readonly dataSource: DataSource,
    @Inject(EMAIL_TEMPLATE_ATTACHMENT_REPOSITORY)
    private readonly attachmentRepo: IEmailTemplateAttachmentRepository,
    @Inject(ATTACHMENT_STORAGE)
    private readonly storage: IAttachmentStorage,
  ) {}

  async execute(id: string): Promise<void> {
    const template = await this.templateRepo.findById(id);
    if (!template) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy mẫu email.');
    }
    if (template.isDefault) {
      throw new AppError(
        ErrorCode.CONFLICT,
        'Không thể xóa mẫu email mặc định.',
      );
    }

    const referenced = await this.isReferencedByReminderRule(
      id,
      template.organizationId,
    );
    if (referenced) {
      throw new AppError(
        ErrorCode.TEMPLATE_IN_USE,
        'Không thể xóa mẫu email đang được một quy tắc nhắc nhở sử dụng.',
      );
    }

    const attachments = await this.attachmentRepo.findAllByTemplateId(id);

    // Both DB writes commit together — an interrupted delete must never leave
    // a template row deleted with attachment rows still pointing at it (or
    // vice versa). Disk cleanup happens after commit, outside the
    // transaction: it's an external side effect, and a failed unlink here
    // only leaks an orphan file rather than risking a partially applied DB
    // delete.
    await this.dataSource.transaction(async (manager) => {
      await this.attachmentRepo.deleteAllByTemplateId(id, manager);
      await this.templateRepo.delete(id, manager);
    });

    for (const attachment of attachments) {
      await this.storage.delete(attachment.storageKey);
    }
  }

  private async isReferencedByReminderRule(
    templateId: string,
    organizationId: string,
  ): Promise<boolean> {
    const rows: Array<{ count: number }> = await this.dataSource.query(
      'SELECT COUNT(*)::int AS count FROM reminder_rules r JOIN reminder_policies p ON p.id::text = r."reminderPolicyId" WHERE r."emailTemplateId" = $1 AND p."organizationId" = $2',
      [templateId, organizationId],
    );
    return Number(rows[0]?.count ?? 0) > 0;
  }
}
