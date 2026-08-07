import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type {
  AuthEmailJob,
  IEmailQueue,
  ReminderEmailJob,
} from '../application/email-queue.port';
import { EMAIL_QUEUE } from './email-queue.constants';

@Injectable()
export class BullMqEmailQueue implements IEmailQueue {
  constructor(@InjectQueue(EMAIL_QUEUE) private readonly queue: Queue) {}

  async add(
    name: 'send-reminder-email',
    data: ReminderEmailJob,
    options: {
      jobId: string;
      attempts: number;
      backoff: { type: 'exponential'; delay: number };
    },
  ): Promise<void>;
  async add(
    name: 'send-auth-email',
    data: AuthEmailJob,
    options?: {
      attempts: number;
      backoff: { type: 'exponential'; delay: number };
    },
  ): Promise<void>;
  async add(
    name: string,
    data: ReminderEmailJob | AuthEmailJob,
    options?: {
      jobId?: string;
      attempts?: number;
      backoff?: { type: 'exponential'; delay: number };
    },
  ): Promise<void> {
    await this.queue.add(name, data, options);
  }
}
