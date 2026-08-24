import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'pending_signups' })
export class PendingSignupOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  email: string;

  @Column({ type: 'varchar' })
  passwordHash: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'varchar' })
  organizationName: string;

  @Column({ type: 'varchar' })
  taxCode: string;

  @Column({ type: 'boolean' })
  taxCodeMatched: boolean;

  @Column({ type: 'varchar', nullable: true })
  taxCodeLookupName: string | null;

  @Column({ type: 'varchar' })
  otpHash: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz' })
  createdAt: Date;
}
