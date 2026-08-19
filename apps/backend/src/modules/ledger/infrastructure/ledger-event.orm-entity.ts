import { Check, Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { LedgerEventKind } from '../domain/ledger-event-kind';
import type { LedgerEventSubjectType } from '../domain/ledger-event-subject-type';

@Entity({ name: 'ledger_events' })
@Index(['organizationId', 'effectiveAt'])
@Index(['organizationId', 'subjectType', 'subjectId', 'effectiveAt'])
@Check('"amount" <> 0')
export class LedgerEventOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  organizationId: string;

  @Column({ type: 'enum', enum: ['RECEIVABLE', 'PAYMENT'] })
  subjectType: LedgerEventSubjectType;

  @Column({ type: 'uuid' })
  subjectId: string;

  @Column({ type: 'varchar' })
  kind: LedgerEventKind;

  @Column('bigint')
  amount: number;

  @Column({ type: 'timestamptz' })
  effectiveAt: Date;

  @Column({ type: 'uuid', nullable: true })
  transitionReferenceId: string | null;

  @Column({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'bigint', generated: 'increment' })
  sequence: number;
}
