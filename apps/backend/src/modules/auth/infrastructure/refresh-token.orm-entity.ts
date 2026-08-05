import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'refresh_tokens' })
@Index(['userId', 'revokedAt'])
export class RefreshTokenOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Index({ unique: true })
  @Column()
  tokenHash: string;

  @Column()
  expiresAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  revokedAt: Date | null;

  @Column()
  createdAt: Date;
}
