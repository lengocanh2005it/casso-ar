import { PlanId, SubscriptionStatus } from '@casso-ar/shared-types';
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

  @Column({ type: 'varchar' })
  organizationId: string;

  @Column({ type: 'enum', enum: PlanId })
  planId: PlanId;

  @Column('int')
  receivableMonthlyLimit: number;

  @Column('int')
  bankConnectionLimit: number;

  @Column('int', { default: 50 })
  copilotChatMonthlyLimit: number;

  @Column('boolean', { default: false })
  canUseCustomSmtp: boolean;

  @Column({ type: 'enum', enum: SubscriptionStatus })
  status: SubscriptionStatus;

  @Column({ type: 'timestamptz' })
  currentPeriodStart: Date;

  @Column({ type: 'timestamptz' })
  currentPeriodEnd: Date;

  @Column({ type: 'timestamptz' })
  createdAt: Date;

  @VersionColumn()
  version: number;
}
