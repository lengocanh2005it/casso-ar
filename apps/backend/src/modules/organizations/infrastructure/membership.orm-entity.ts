import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { Role } from '../domain/membership';

@Entity({ name: 'memberships' })
@Index(['organizationId', 'userId'], { unique: true })
export class MembershipOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  organizationId: string;

  @Column({ type: 'varchar' })
  userId: string;

  @Column({ type: 'enum', enum: Role })
  role: Role;

  @Column({ type: 'timestamptz' })
  invitedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  joinedAt: Date | null;

  @Column({ type: 'timestamptz' })
  createdAt: Date;
}
