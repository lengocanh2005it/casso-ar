import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import { BaseRepository } from '../../../common/tenancy/base.repository';
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

  async lockAndFindByOrganizationId(
    organizationId: string,
    manager: EntityManager,
  ): Promise<Subscription | null> {
    // hashtext() collapses the UUID into a 32-bit key for the advisory-lock
    // keyspace; a rare hash collision would only over-serialize two
    // unrelated orgs, never under-serialize the same org.
    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      organizationId,
    ]);
    const row = await manager.findOne(SubscriptionOrmEntity, {
      where: { organizationId },
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
    organizationId?: string,
  ): Promise<void> {
    await this.scopedSaveWithManager(
      subscription as unknown as SubscriptionOrmEntity,
      manager,
      organizationId,
    );
  }
}
