import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { Role } from '../../organizations/domain/membership';
import { REMINDER_SEND_QUEUE } from '../application/reminder-scheduler.service';
import type { SendReminderJob } from '../application/reminder-sender.service';
import { ReminderSenderService } from '../application/reminder-sender.service';

@Injectable()
@Processor(REMINDER_SEND_QUEUE)
export class ReminderSendProcessor extends WorkerHost {
  private readonly logger = new Logger(ReminderSendProcessor.name);

  constructor(
    private readonly senderService: ReminderSenderService,
    private readonly tenantContext: TenantContextService,
  ) {
    super();
  }

  async process(job: Job<SendReminderJob>): Promise<void> {
    await this.tenantContext.run(
      {
        userId: 'system',
        organizationId: job.data.organizationId,
        role: Role.OWNER,
      },
      () => this.senderService.send(job.data),
    );
  }
}
