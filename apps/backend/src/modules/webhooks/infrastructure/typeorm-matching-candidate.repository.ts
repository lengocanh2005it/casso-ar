import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import type { IMatchingCandidateRepository } from '../application/matching-candidate-repository.port';
import type { MatchingCandidate } from '../domain/matching-candidate';
import { MatchingCandidateOrmEntity } from './matching-candidate.orm-entity';

function toOrm(candidate: MatchingCandidate): MatchingCandidateOrmEntity {
  return Object.assign(new MatchingCandidateOrmEntity(), candidate);
}

@Injectable()
export class TypeOrmMatchingCandidateRepository
  implements IMatchingCandidateRepository
{
  constructor(
    @InjectRepository(MatchingCandidateOrmEntity)
    private readonly repo: Repository<MatchingCandidateOrmEntity>,
  ) {}
  async saveMany(
    candidates: MatchingCandidate[],
    manager?: EntityManager,
  ): Promise<void> {
    await (
      manager?.getRepository(MatchingCandidateOrmEntity) ?? this.repo
    ).save(candidates.map(toOrm));
  }
}
