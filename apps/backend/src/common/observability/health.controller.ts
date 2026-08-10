import { InjectQueue } from '@nestjs/bullmq';
import { Controller, Get, Inject, Res } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { Response } from 'express';
import { DataSource } from 'typeorm';
import { WEBHOOK_PROCESSING_QUEUE } from '../../modules/webhooks/infrastructure/webhooks-queue.constants';
import { Public } from '../auth/public.decorator';

interface HealthChecks {
  postgres: boolean;
  redis: boolean;
  bullmq: boolean;
}

interface HealthResult {
  httpStatus: number;
  body: { status: 'ok' | 'degraded'; checks: HealthChecks };
}

@Public()
@Controller('health')
export class HealthController {
  constructor(
    @Inject(DataSource) private readonly dataSource: DataSource,
    @InjectQueue(WEBHOOK_PROCESSING_QUEUE)
    private readonly webhookQueue: Queue,
  ) {}

  async check(): Promise<HealthResult> {
    const checks: HealthChecks = {
      postgres: await this.checkPostgres(),
      redis: await this.checkRedis(),
      bullmq: await this.checkBullmq(),
    };
    const allHealthy = Object.values(checks).every(Boolean);

    return {
      httpStatus: allHealthy ? 200 : 503,
      body: { status: allHealthy ? 'ok' : 'degraded', checks },
    };
  }

  @Get()
  async handle(@Res() res: Response): Promise<void> {
    const { httpStatus, body } = await this.check();
    res.status(httpStatus).json(body);
  }

  private async checkPostgres(): Promise<boolean> {
    try {
      await this.dataSource.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  private async checkRedis(): Promise<boolean> {
    try {
      const client = await this.webhookQueue.getBackend().client;
      await client.info();
      return true;
    } catch {
      return false;
    }
  }

  private async checkBullmq(): Promise<boolean> {
    try {
      await this.webhookQueue.getJobCounts();
      return true;
    } catch {
      return false;
    }
  }
}
