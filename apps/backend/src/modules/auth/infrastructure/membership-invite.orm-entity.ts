import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { Role } from '../../organizations/domain/membership';

@Entity({ name: 'membership_invites' })
@Index(['organizationId', 'email'])
export class MembershipInviteOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  organizationId: string;

  @Column({ type: 'varchar' })
  email: string;

  @Column({ type: 'enum', enum: Role })
  role: Role;

  @Column({ type: 'varchar' })
  invitedByUserId: string;

  @Index({ unique: true })
  @Column({ type: 'varchar' })
  tokenHash: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  acceptedAt: Date | null;

  @Column({ type: 'timestamptz' })
  createdAt: Date;
}
