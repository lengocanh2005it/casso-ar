import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { Role } from '../domain/membership';

@Entity({ name: 'memberships' })
@Index(['organizationId', 'userId'], { unique: true })
export class MembershipOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  organizationId: string;

  @Column()
  userId: string;

  @Column({ type: 'enum', enum: Role })
  role: Role;

  @Column()
  invitedAt: Date;

  @Column({ nullable: true })
  joinedAt: Date | null;

  @Column()
  createdAt: Date;
}
