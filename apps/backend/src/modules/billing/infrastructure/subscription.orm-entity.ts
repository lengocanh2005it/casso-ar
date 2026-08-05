import { PlanId, SubscriptionStatus } from '@casso-ledger/shared-types';
import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  VersionColumn,
} from 'typeorm';

@Entity({ name: 'subscriptions' })
@Unique(['organizationId'])
export class SubscriptionOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  organizationId: string;

  @Column({ type: 'enum', enum: PlanId })
  planId: PlanId;

  @Column('int')
  receivableMonthlyLimit: number;

  @Column('int')
  bankConnectionLimit: number;

  @Column({ type: 'enum', enum: SubscriptionStatus })
  status: SubscriptionStatus;

  @Column()
  currentPeriodStart: Date;

  @Column()
  currentPeriodEnd: Date;

  @Column()
  createdAt: Date;

  @VersionColumn()
  version: number;
}
