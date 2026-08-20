import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'email_verification_tokens' })
@Index('IDX_email_verification_tokens_user_id_token_hash', [
  'userId',
  'tokenHash',
])
export class EmailVerificationTokenOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  userId: string;

  @Column({ type: 'varchar' })
  tokenHash: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz' })
  createdAt: Date;
}
