import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { Role } from '../../organizations/domain/membership';

@Entity({ name: 'membership_invites' })
@Index(['organizationId', 'email'])
export class MembershipInviteOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  organizationId: string;

  @Column()
  email: string;

  @Column({ type: 'enum', enum: Role })
  role: Role;

  @Column()
  invitedByUserId: string;

  @Index({ unique: true })
  @Column()
  tokenHash: string;

  @Column()
  expiresAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  acceptedAt: Date | null;

  @Column()
  createdAt: Date;
}
