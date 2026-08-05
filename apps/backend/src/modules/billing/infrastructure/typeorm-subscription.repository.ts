import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import { BaseRepository } from '../../../common/tenancy/base.repository';
// biome-ignore lint/style/useImportType: must be a value import — NestJS DI resolves this constructor param via emitDecoratorMetadata's design:paramtypes, which erases type-only imports to `Function`
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { ISubscriptionRepository } from '../application/subscription-repository.port';
import { Subscription } from '../domain/subscription';
import { SubscriptionOrmEntity } from './subscription.orm-entity';

@Injectable()
export class TypeOrmSubscriptionRepository
  extends BaseRepository<SubscriptionOrmEntity>
  implements ISubscriptionRepository
{
  constructor(
    @InjectRepository(SubscriptionOrmEntity)
    repo: Repository<SubscriptionOrmEntity>,
    tenantContext: TenantContextService,
  ) {
    super(repo, tenantContext);
  }

  async findByOrganizationIdForUpdate(
    organizationId: string,
    manager: EntityManager,
  ): Promise<Subscription | null> {
    const row = await manager.findOne(SubscriptionOrmEntity, {
      where: { organizationId },
      lock: { mode: 'pessimistic_write' },
    });
    return row ? new Subscription(row) : null;
  }

  // Reads the Receivable table directly per the spec (no separate usage
  // table) — raw SQL keeps billing from depending on the receivables
  // module's infrastructure entity.
  async countReceivablesInPeriod(
    organizationId: string,
    periodStart: Date,
    periodEnd: Date,
    manager: EntityManager,
  ): Promise<number> {
    const rows: Array<{ count: string }> = await manager.query(
      'SELECT COUNT(*) as count FROM receivables WHERE "organizationId" = $1 AND "createdAt" >= $2 AND "createdAt" < $3',
      [organizationId, periodStart, periodEnd],
    );
    return Number(rows[0]?.count ?? 0);
  }

  async save(
    subscription: Subscription,
    manager?: EntityManager,
  ): Promise<void> {
    await this.scopedSaveWithManager(
      subscription as unknown as SubscriptionOrmEntity,
      manager,
    );
  }
}
