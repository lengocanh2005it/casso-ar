import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  VersionColumn,
} from 'typeorm';
import { DisputeStatus } from '../domain/dispute';

@Entity({ name: 'disputes' })
@Index(['organizationId', 'receivableId', 'status'])
@Index('IDX_disputes_one_open_per_receivable', ['receivableId'], {
  unique: true,
  where: '"status" = \'OPEN\'',
})
export class DisputeOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  organizationId: string;

  @Column('uuid')
  receivableId: string;

  @Column('text')
  reason: string;

  @Column({ type: 'enum', enum: DisputeStatus })
  status: DisputeStatus;

  @Column('uuid')
  openedByUserId: string;

  @Column('uuid', { nullable: true })
  resolvedByUserId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @Column({ type: 'timestamptz' })
  createdAt: Date;

  @VersionColumn()
  version: number;
}
