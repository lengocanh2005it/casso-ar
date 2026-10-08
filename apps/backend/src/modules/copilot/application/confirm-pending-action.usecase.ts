import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { REMINDER_EXECUTION_REPOSITORY } from '../../../common/tokens/reminder-execution.token';
import {
  EMAIL_TEMPLATE_REPOSITORY,
  type IEmailTemplateRepository,
} from '../../email-templates/application/email-template-repository.port';
import { EmailTemplate } from '../../email-templates/domain/email-template';
import { EmailService } from '../../notifications/application/email.service';
import { type IReminderExecutionRepository } from '../../reminders/application/reminder-execution-repository.port';
import {
  ReminderExecution,
  ReminderExecutionStatus,
} from '../../reminders/domain/reminder-execution';
import {
  COPILOT_DRAFT_REPOSITORY,
  type CopilotDraft,
  type ICopilotDraftRepository,
} from './draft-repository.port';
import {
  COPILOT_PENDING_ACTION_REPOSITORY,
  type CopilotPendingAction,
  type ICopilotPendingActionRepository,
  PENDING_ACTION_EXPIRY_MINUTES,
} from './pending-action-repository.port';

@Injectable()
export class ConfirmPendingActionUseCase {
  constructor(
    @Inject(COPILOT_PENDING_ACTION_REPOSITORY)
    private readonly pendingActionRepo: ICopilotPendingActionRepository,
    @Inject(COPILOT_DRAFT_REPOSITORY)
    private readonly draftRepo: ICopilotDraftRepository,
    @Inject(EMAIL_TEMPLATE_REPOSITORY)
    private readonly emailTemplateRepo: IEmailTemplateRepository,
    @Inject(REMINDER_EXECUTION_REPOSITORY)
    private readonly reminderExecutionRepo: IReminderExecutionRepository,
    private readonly emailService: EmailService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async execute(
    pendingActionId: string,
    resolvedByUserId: string,
  ): Promise<{ reminderExecutionId: string }> {
    const action = await this.pendingActionRepo.confirmIfPending(
      pendingActionId,
      resolvedByUserId,
    );
    if (!action) {
      throw new AppError(
        ErrorCode.CONFLICT,
        'Đề xuất gửi email đã được xử lý hoặc không còn hiệu lực.',
      );
    }

    if (this.isExpired(action)) {
      await this.pendingActionRepo.markExpired(pendingActionId);
      throw new AppError(
        ErrorCode.CONFLICT,
        'Đề xuất gửi email đã hết hạn — vui lòng yêu cầu Copilot soạn lại.',
      );
    }

    const draft = await this.draftRepo.findById(action.payload.draftId);
    if (!draft) {
      throw new AppError(
        ErrorCode.NOT_FOUND,
        `Không tìm thấy bản nháp email ${action.payload.draftId}.`,
      );
    }
    this.assertDraftMatchesAction(action, draft);

    const now = new Date();
    const template = new EmailTemplate({
      id: randomUUID(),
      organizationId: action.organizationId,
      name: `Copilot draft ${draft.id}`,
      subject: draft.subject,
      bodyHtml: draft.bodyHtml,
      reminderStage: null,
      isDefault: false,
      createdAt: now,
      updatedAt: now,
      version: 1,
    });
    const execution = new ReminderExecution({
      id: randomUUID(),
      organizationId: action.organizationId,
      receivableId: action.payload.receivableId,
      reminderRuleId: null,
      minIntervalDays: null,
      executionDate: now,
      sentAt: null,
      status: ReminderExecutionStatus.PENDING,
      skipReason: null,
      providerMessageId: null,
      failureReason: null,
      createdAt: now,
    });

    // Both rows must land together — a crash between them would otherwise
    // leave an orphaned EmailTemplate with no matching execution. EmailService
    // is called after the transaction commits, never inside it.
    await this.dataSource.transaction(async (manager) => {
      await this.emailTemplateRepo.save(template, manager);
      await this.reminderExecutionRepo.save(execution, manager);
    });

    await this.emailService.sendReminderEmail({
      receivableId: action.payload.receivableId,
      templateId: template.id,
      reminderExecutionId: execution.id,
    });

    return { reminderExecutionId: execution.id };
  }

  private isExpired(action: CopilotPendingAction): boolean {
    return (
      Date.now() - action.createdAt.getTime() >
      PENDING_ACTION_EXPIRY_MINUTES * 60 * 1000
    );
  }

  private assertDraftMatchesAction(
    action: CopilotPendingAction,
    draft: CopilotDraft,
  ): void {
    if (
      draft.organizationId !== action.organizationId ||
      draft.receivableId !== action.payload.receivableId
    ) {
      throw new AppError(
        ErrorCode.CONFLICT,
        'Bản nháp email không khớp với đề xuất gửi.',
      );
    }
  }
}
