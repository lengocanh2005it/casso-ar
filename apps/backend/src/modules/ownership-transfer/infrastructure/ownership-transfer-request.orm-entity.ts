import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { OwnershipTransferStatus } from '../domain/ownership-transfer-request';

@Entity({ name: 'ownership_transfer_requests' })
@Index(['organizationId'])
export class OwnershipTransferRequestOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  organizationId: string;

  @Column({ type: 'varchar' })
  fromUserId: string;

  @Column({ type: 'varchar' })
  toUserId: string;

  @Column({ type: 'varchar' })
  status: OwnershipTransferStatus;

  @Column({ type: 'varchar' })
  otpHash: string;

  @Column({ type: 'timestamptz' })
  otpExpiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  acceptanceExpiresAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @Column({ type: 'timestamptz' })
  createdAt: Date;
}
