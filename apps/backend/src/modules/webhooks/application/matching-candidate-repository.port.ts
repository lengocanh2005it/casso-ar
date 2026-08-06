import type { EntityManager } from 'typeorm';
import type { MatchingCandidate } from '../domain/matching-candidate';

export interface IMatchingCandidateRepository {
  saveMany(
    candidates: MatchingCandidate[],
    manager?: EntityManager,
  ): Promise<void>;
  findByBankTransactionId(
    bankTransactionId: string,
  ): Promise<MatchingCandidate[]>;
  findTopByBankTransactionIds(
    bankTransactionIds: string[],
  ): Promise<Map<string, MatchingCandidate>>;
}
export const MATCHING_CANDIDATE_REPOSITORY = Symbol(
  'MATCHING_CANDIDATE_REPOSITORY',
);
