import { PeriodChargeStatus, PlanId } from '@casso-ar/shared-types';
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

  @Column('bigint', { nullable: true })
  quotedAmount: number | null;

  @Column({ type: 'varchar', nullable: true })
  payosPaymentLinkId: string | null;

  @Column({ type: 'enum', enum: PeriodChargeStatus })
  status: PeriodChargeStatus;

  @Column({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz' })
  updatedAt: Date;
}
