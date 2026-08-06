export interface MatchingCandidateProps {
  id: string;
  organizationId: string;
  bankTransactionId: string;
  receivableId: string;
  customerId: string;
  referenceCodeScore: number;
  amountScore: number;
  customerBankAccountScore: number;
  payerNameScore: number;
  timingScore: number;
  totalScore: number;
  createdAt: Date;
}

export class MatchingCandidate {
  readonly id: string;
  readonly organizationId: string;
  readonly bankTransactionId: string;
  readonly receivableId: string;
  readonly customerId: string;
  readonly referenceCodeScore: number;
  readonly amountScore: number;
  readonly customerBankAccountScore: number;
  readonly payerNameScore: number;
  readonly timingScore: number;
  readonly totalScore: number;
  readonly createdAt: Date;
  constructor(props: MatchingCandidateProps) {
    Object.assign(this, props);
  }
}
