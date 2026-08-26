import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import {
  CUSTOMER_REPOSITORY,
  type ICustomerRepository,
} from '../../customers/application/customer-repository.port';
import {
  type IInvoiceRepository,
  INVOICE_REPOSITORY,
} from '../../invoices/application/invoice-repository.port';
import {
  type IReceivableRepository,
  RECEIVABLE_REPOSITORY,
} from '../../receivables/application/receivable-repository.port';
import {
  COPILOT_CONVERSATION_REPOSITORY,
  type ICopilotConversationRepository,
} from './conversation-repository.port';
import {
  COPILOT_DRAFT_REPOSITORY,
  type ICopilotDraftRepository,
} from './draft-repository.port';
import { findMutableDraft } from './find-mutable-draft';
import {
  COPILOT_PENDING_ACTION_REPOSITORY,
  type CopilotPendingAction,
  enrichSendReminderEmailPayload,
  type ICopilotPendingActionRepository,
} from './pending-action-repository.port';

@Injectable()
export class ReopenCopilotDraftUseCase {
  constructor(
    @Inject(COPILOT_DRAFT_REPOSITORY)
    private readonly draftRepo: ICopilotDraftRepository,
    @Inject(COPILOT_PENDING_ACTION_REPOSITORY)
    private readonly pendingActionRepo: ICopilotPendingActionRepository,
    @Inject(COPILOT_CONVERSATION_REPOSITORY)
    private readonly conversationRepo: ICopilotConversationRepository,
    private readonly tenantContext: TenantContextService,
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(RECEIVABLE_REPOSITORY)
    private readonly receivableRepo?: IReceivableRepository,
    @Inject(CUSTOMER_REPOSITORY)
    private readonly customerRepo?: ICustomerRepository,
    @Inject(INVOICE_REPOSITORY)
    private readonly invoiceRepo?: IInvoiceRepository,
  ) {}

  async execute(
    draftId: string,
  ): Promise<{ conversationId: string; pendingAction: CopilotPendingAction }> {
    const user = this.tenantContext.getCurrentUser();
    if (!user) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Yêu cầu đăng nhập.');
    }

    return this.dataSource.transaction(async (manager: EntityManager) => {
      const { draft } = await findMutableDraft(
        draftId,
        user.userId,
        this.draftRepo,
        this.pendingActionRepo,
        manager,
      );
      const conversation = await this.conversationRepo.findOrCreate(
        randomUUID(),
        user.userId,
        undefined,
        manager,
      );
      const payload = await enrichSendReminderEmailPayload(
        { draftId: draft.id, receivableId: draft.receivableId },
        user.organizationId,
        this.receivableRepo,
        this.customerRepo,
        this.invoiceRepo,
      );
      const pendingAction = await this.pendingActionRepo.create(
        conversation.id,
        payload,
        manager,
      );
      return { conversationId: conversation.id, pendingAction };
    });
  }
}
