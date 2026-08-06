import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  EMAIL_TEMPLATE_REPOSITORY,
  type IEmailTemplateRepository,
} from './email-template-repository.port';

const POSTGRES_UNDEFINED_TABLE_ERROR_CODE = '42P01';

@Injectable()
export class DeleteEmailTemplateUseCase {
  constructor(
    @Inject(EMAIL_TEMPLATE_REPOSITORY)
    private readonly templateRepo: IEmailTemplateRepository,
    private readonly dataSource: DataSource,
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

    await this.templateRepo.delete(id);
  }

  // ASSUMPTION: assumes a `reminder_rules` table with an `emailTemplateId`
  // column, per the Reminder Automation design (ReminderRule.emailTemplateId).
  // That plan has not been implemented yet, so the table may not exist. If it
  // doesn't (Postgres error 42P01 "undefined_table"), there is nothing that
  // could reference this template yet — allow the delete. Once the Reminder
  // Automation plan creates the real table, this same query starts enforcing
  // the guard for real with no code change here.
  private async isReferencedByReminderRule(
    templateId: string,
    organizationId: string,
  ): Promise<boolean> {
    try {
      const rows: Array<{ count: number }> = await this.dataSource.query(
        'SELECT COUNT(*)::int AS count FROM reminder_rules WHERE "emailTemplateId" = $1 AND "organizationId" = $2',
        [templateId, organizationId],
      );
      return Number(rows[0]?.count ?? 0) > 0;
    } catch (error) {
      if (
        (error as { code?: string }).code ===
        POSTGRES_UNDEFINED_TABLE_ERROR_CODE
      ) {
        return false;
      }
      throw error;
    }
  }
}
