import { PlanId, SubscriptionStatus } from '@casso-ledger/shared-types';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type EntityManager, Not, type Repository } from 'typeorm';
import { BaseRepository } from '../../../common/tenancy/base.repository';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { ISubscriptionRepository } from '../application/subscription-repository.port';
import { Subscription } from '../domain/subscription';
import { SubscriptionOrmEntity } from './subscription.orm-entity';

// Explicit domain → ORM translation: the compiler checks every field, so a
// drift between the two shapes fails here instead of being cast away.
function toOrm(subscription: Subscription): SubscriptionOrmEntity {
  return {
    id: subscription.id,
    organizationId: subscription.organizationId,
    planId: subscription.planId,
    receivableMonthlyLimit: subscription.receivableMonthlyLimit,
    bankConnectionLimit: subscription.bankConnectionLimit,
    copilotChatMonthlyLimit: subscription.copilotChatMonthlyLimit,
    canUseCustomSmtp: subscription.canUseCustomSmtp,
    status: subscription.status,
    currentPeriodStart: subscription.currentPeriodStart,
    currentPeriodEnd: subscription.currentPeriodEnd,
    createdAt: subscription.createdAt,
    version: subscription.version,
  };
}

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

  async findAllPaidTierActive(): Promise<Subscription[]> {
    const rows = await this.ormRepo.find({
      where: { planId: Not(PlanId.FREE), status: SubscriptionStatus.ACTIVE },
    });
    return rows.map((row) => new Subscription(row));
  }

  async findByOrganizationId(
    organizationId: string,
  ): Promise<Subscription | null> {
    const row = await this.ormRepo.findOne({ where: { organizationId } });
    return row ? new Subscription(row) : null;
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

  async countCopilotChatTurnsInPeriod(
    organizationId: string,
    periodStart: Date,
    periodEnd: Date,
    manager: EntityManager,
  ): Promise<number> {
    const rows: Array<{ count: string }> = await manager.query(
      'SELECT COUNT(*) as count FROM copilot_messages WHERE "organizationId" = $1 AND role = \'USER\' AND "createdAt" >= $2 AND "createdAt" < $3',
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
      toOrm(subscription),
      manager,
      organizationId,
    );
  }
}
