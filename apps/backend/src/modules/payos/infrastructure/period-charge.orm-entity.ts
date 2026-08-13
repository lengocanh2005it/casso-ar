import { PeriodChargeStatus, PlanId } from '@casso-ledger/shared-types';
import {
  Column,
  Entity,
  Generated,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'period_charges' })
@Index(['orderCode'], { unique: true })
export class PeriodChargeOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('bigint')
  @Generated('increment')
  orderCode: string;

  @Column({ type: 'varchar' })
  organizationId: string;

  @Column({ type: 'enum', enum: PlanId })
  planId: PlanId;

  @Column({ type: 'timestamptz' })
  periodStart: Date;

  @Column({ type: 'timestamptz' })
  periodEnd: Date;

  @Column({ type: 'enum', enum: PeriodChargeStatus })
  status: PeriodChargeStatus;

  @Column({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz' })
  updatedAt: Date;
}
