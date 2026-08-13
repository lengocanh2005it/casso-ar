import { PlanId, PlanUpgradeOrderStatus } from '@casso-ledger/shared-types';
import {
  Column,
  Entity,
  Generated,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'plan_upgrade_orders' })
@Index(['orderCode'], { unique: true })
export class PlanUpgradeOrderOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('bigint')
  @Generated('increment')
  orderCode: string;

  @Column({ type: 'varchar' })
  organizationId: string;

  @Column({ type: 'enum', enum: PlanId })
  targetPlanId: PlanId;

  @Column({ type: 'enum', enum: PlanUpgradeOrderStatus })
  status: PlanUpgradeOrderStatus;

  @Column({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz' })
  updatedAt: Date;
}
