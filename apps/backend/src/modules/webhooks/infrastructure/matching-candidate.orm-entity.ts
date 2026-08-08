import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'matching_candidates' })
@Index(['bankTransactionId', 'totalScore'])
export class MatchingCandidateOrmEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar' }) organizationId: string;
  @Column({ type: 'varchar' }) bankTransactionId: string;
  @Column({ type: 'varchar' }) receivableId: string;
  @Column({ type: 'varchar' }) customerId: string;
  @Column({ type: 'integer' }) referenceCodeScore: number;
  @Column({ type: 'integer' }) amountScore: number;
  @Column({ type: 'integer' }) customerBankAccountScore: number;
  @Column({ type: 'integer' }) payerNameScore: number;
  @Column({ type: 'integer' }) timingScore: number;
  @Column({ type: 'integer' }) totalScore: number;
  @Column({ type: 'timestamptz' }) createdAt: Date;
}
