import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { buildCassoEmail } from '../../../common/email/casso-email-template';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import {
  BANK_CONNECTION_STATUS_CHANGED,
  type BankConnectionStatusChangedEvent,
} from '../../bank-connections/application/mark-requires-reauthorization.usecase';
import {
  type IMembershipRepository,
  MEMBERSHIP_REPOSITORY,
} from '../../organizations/application/membership-repository.port';
import { Role } from '../../organizations/domain/membership';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../users/application/user-repository.port';
import {
  EMAIL_QUEUE_PORT,
  type IEmailQueue,
} from '../application/email-queue.port';

@Injectable()
export class BankConnectionStatusListener {
  private readonly logger = new Logger(BankConnectionStatusListener.name);

  constructor(
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: IMembershipRepository,
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    @Inject(EMAIL_QUEUE_PORT) private readonly emailQueue: IEmailQueue,
    private readonly tenantContext: TenantContextService,
  ) {}

  @OnEvent(BANK_CONNECTION_STATUS_CHANGED)
  async handle(payload: BankConnectionStatusChangedEvent): Promise<void> {
    try {
      await this.enqueueOwnerAlert(payload);
    } catch (error) {
      this.logger.error({
        message: 'Owner alert could not be enqueued',
        bankConnectionId: payload.bankConnectionId,
        organizationId: payload.organizationId,
        status: payload.status,
        userId: 'system',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async enqueueOwnerAlert(
    payload: BankConnectionStatusChangedEvent,
  ): Promise<void> {
    await this.tenantContext.run(
      {
        userId: 'system',
        organizationId: payload.organizationId,
        role: Role.OWNER,
      },
      async () => {
        const membership = await this.membershipRepo.findOwnerByOrganization(
          payload.organizationId,
        );
        const owner = membership
          ? await this.userRepo.findById(membership.userId)
          : null;
        if (!owner?.email) return;

        const isError = payload.status === 'ERROR';
        const subject = isError
          ? 'Kết nối ngân hàng của bạn đang gặp sự cố'
          : 'Kết nối ngân hàng của bạn cần xác thực lại';
        const content = buildCassoEmail({
          title: subject,
          greeting: 'Kính chào Quý khách,',
          paragraphs: [
            isError
              ? 'Casso không thể đồng bộ giao dịch từ kết nối ngân hàng của bạn. Vui lòng kiểm tra và xác thực lại kết nối để tiếp tục sử dụng.'
              : 'Kết nối ngân hàng của bạn cần xác thực lại để tiếp tục đồng bộ giao dịch. Vui lòng thực hiện xác thực lại.',
          ],
        });
        await this.emailQueue.add(
          'send-owner-alert',
          {
            organizationId: payload.organizationId,
            to: owner.email,
            subject,
            html: content.html,
            text: content.text,
            attachments: content.attachments,
          },
          {
            jobId: `owner-alert-${payload.bankConnectionId}-${payload.status}`,
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
          },
        );
      },
    );
  }
}
