import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'operator_audit_logs' })
export class OperatorAuditLogOrmEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  operatorId: string;

  @Column({ type: 'varchar' })
  organizationId: string;

  @Column({ type: 'varchar' })
  actionType: string;

  @Column({ type: 'varchar', nullable: true })
  membershipId: string | null;

  @Column({ type: 'timestamptz' })
  createdAt: Date;
}
