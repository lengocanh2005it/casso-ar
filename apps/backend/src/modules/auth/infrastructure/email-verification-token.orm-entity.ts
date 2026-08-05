import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'email_verification_tokens' })
export class EmailVerificationTokenOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Index({ unique: true })
  @Column()
  tokenHash: string;

  @Column()
  expiresAt: Date;

  @Column()
  createdAt: Date;
}
