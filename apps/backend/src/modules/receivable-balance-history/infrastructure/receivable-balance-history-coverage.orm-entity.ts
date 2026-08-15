import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'receivable_balance_history_coverage' })
export class ReceivableBalanceHistoryCoverageOrmEntity {
  @PrimaryColumn({ type: 'varchar' })
  organizationId: string;

  @Column({ type: 'timestamptz' })
  coveredFrom: Date;

  @Column({ type: 'varchar' })
  reason: string;
}
