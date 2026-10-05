import {
  PlanId,
  PlanPaymentHistoryProvenance,
  PlanPaymentHistorySourceType,
  PlanPaymentReceiptOutcome,
} from '@casso-ar/shared-types';
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'plan_payment_history' })
@Index('IDX_plan_payment_history_organization_confirmed', [
  'organizationId',
  'confirmedAt',
  'id',
])
@Index(
  'UQ_plan_payment_history_legacy_source',
  ['organizationId', 'sourceType', 'sourceId'],
  { unique: true, where: `"provenance" = 'LEGACY_BACKFILL'` },
)
@Index(
  'UQ_plan_payment_history_transfer_identity',
  ['organizationId', 'payosPaymentLinkId', 'transferIdentity'],
  { unique: true, where: '"transferIdentity" IS NOT NULL' },
)
@Index(
  'UQ_plan_payment_history_delivery_fingerprint',
  ['organizationId', 'deliveryFingerprint'],
  { unique: true, where: '"deliveryFingerprint" IS NOT NULL' },
)
export class PlanPaymentHistoryOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  organizationId: string;

  @Column({ type: 'enum', enum: PlanPaymentHistorySourceType })
  sourceType: PlanPaymentHistorySourceType;

  @Column({ type: 'uuid' })
  sourceId: string;

  @Column('bigint')
  orderCode: string;

  @Column({
    type: 'enum',
    enum: PlanId,
    enumName: 'plan_upgrade_orders_targetPlanId_enum',
  })
  planId: PlanId;

  @Column({ type: 'timestamptz', nullable: true })
  periodStart: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  periodEnd: Date | null;

  @Column('bigint', { nullable: true })
  receivedAmount: number | null;

  @Column('bigint', { nullable: true })
  quotedAmount: number | null;

  @Column({ type: 'varchar', nullable: true })
  payosPaymentLinkId: string | null;

  @Column({ type: 'varchar', nullable: true })
  providerReference: string | null;

  @Column({ type: 'varchar', nullable: true })
  providerTransactionTime: string | null;

  @Column({ type: 'varchar', nullable: true })
  transferIdentity: string | null;

  @Column({ type: 'varchar', nullable: true })
  deliveryFingerprint: string | null;

  @Column({ type: 'enum', enum: PlanPaymentReceiptOutcome })
  initialOutcome: PlanPaymentReceiptOutcome;

  @Column({ type: 'enum', enum: PlanPaymentHistoryProvenance })
  provenance: PlanPaymentHistoryProvenance;

  @Column({ type: 'timestamptz' })
  confirmedAt: Date;

  @Column({ type: 'timestamptz' })
  createdAt: Date;
}
