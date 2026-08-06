import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type {
  EmailQueueJob,
  IEmailQueue,
} from '../application/email-queue.port';
import { EMAIL_QUEUE } from './email-queue.constants';

@Injectable()
export class BullMqEmailQueue implements IEmailQueue {
  constructor(@InjectQueue(EMAIL_QUEUE) private readonly queue: Queue) {}

  async add(
    name: 'send-reminder-email',
    data: EmailQueueJob,
    options: {
      jobId: string;
      attempts: number;
      backoff: { type: 'exponential'; delay: number };
    },
  ): Promise<void> {
    await this.queue.add(name, data, options);
  }
}
