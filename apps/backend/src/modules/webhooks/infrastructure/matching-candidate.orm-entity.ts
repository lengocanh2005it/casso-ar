import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'matching_candidates' })
@Index(['bankTransactionId', 'totalScore'])
export class MatchingCandidateOrmEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() organizationId: string;
  @Column() bankTransactionId: string;
  @Column() receivableId: string;
  @Column() customerId: string;
  @Column() referenceCodeScore: number;
  @Column() amountScore: number;
  @Column() customerBankAccountScore: number;
  @Column() payerNameScore: number;
  @Column() timingScore: number;
  @Column() totalScore: number;
  @Column() createdAt: Date;
}
