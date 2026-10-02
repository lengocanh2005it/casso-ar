import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import { In } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { BaseRepository } from '../../../common/tenancy/base.repository';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { IMatchingCandidateRepository } from '../application/matching-candidate-repository.port';
import { MatchingCandidate } from '../domain/matching-candidate';
import { MatchingCandidateOrmEntity } from './matching-candidate.orm-entity';

function toOrm(candidate: MatchingCandidate): MatchingCandidateOrmEntity {
  return {
    id: candidate.id,
    organizationId: candidate.organizationId,
    bankTransactionId: candidate.bankTransactionId,
    receivableId: candidate.receivableId,
    customerId: candidate.customerId,
    referenceCodeScore: candidate.referenceCodeScore,
    amountScore: candidate.amountScore,
    customerBankAccountScore: candidate.customerBankAccountScore,
    payerNameScore: candidate.payerNameScore,
    timingScore: candidate.timingScore,
    totalScore: candidate.totalScore,
    createdAt: candidate.createdAt,
  };
}

@Injectable()
export class TypeOrmMatchingCandidateRepository
  extends BaseRepository<MatchingCandidateOrmEntity>
  implements IMatchingCandidateRepository
{
  constructor(
    @InjectRepository(MatchingCandidateOrmEntity)
    repo: Repository<MatchingCandidateOrmEntity>,
    tenantContext: TenantContextService,
  ) {
    super(repo, tenantContext);
  }

  async saveMany(
    candidates: MatchingCandidate[],
    manager?: EntityManager,
  ): Promise<void> {
    const organizationId = this.tenantContext.getOrganizationId();
    for (const candidate of candidates) {
      if (candidate.organizationId !== organizationId) {
        throw new AppError(
          ErrorCode.TENANT_MISMATCH,
          'Không thể ghi dữ liệu khác tổ chức hiện tại.',
        );
      }
    }
    const repo = manager
      ? manager.getRepository(MatchingCandidateOrmEntity)
      : this.ormRepo;
    await repo.save(candidates.map(toOrm));
  }

  async findByBankTransactionId(
    bankTransactionId: string,
  ): Promise<MatchingCandidate[]> {
    const organizationId = this.tenantContext.getOrganizationId();
    const rows = await this.ormRepo.find({
      where: { organizationId, bankTransactionId },
      order: { totalScore: 'DESC' },
    });
    return rows.map((row) => new MatchingCandidate(row));
  }

  async findTopByBankTransactionIds(
    bankTransactionIds: string[],
  ): Promise<Map<string, MatchingCandidate>> {
    if (bankTransactionIds.length === 0) return new Map();
    const organizationId = this.tenantContext.getOrganizationId();
    const rows = await this.ormRepo.find({
      where: { organizationId, bankTransactionId: In(bankTransactionIds) },
      order: { totalScore: 'DESC' },
    });
    const topCandidates = new Map<string, MatchingCandidate>();
    for (const row of rows) {
      if (!topCandidates.has(row.bankTransactionId)) {
        topCandidates.set(row.bankTransactionId, new MatchingCandidate(row));
      }
    }
    return topCandidates;
  }

  // ponytail: second batch query per queue page; fold into
  // findTopByBankTransactionIds if the extra round trip ever matters.
  async findRunnerUpScoresByBankTransactionIds(
    bankTransactionIds: string[],
  ): Promise<Map<string, number>> {
    if (bankTransactionIds.length === 0) return new Map();
    const organizationId = this.tenantContext.getOrganizationId();
    const rows = await this.ormRepo.find({
      select: { bankTransactionId: true, totalScore: true },
      where: { organizationId, bankTransactionId: In(bankTransactionIds) },
      order: { totalScore: 'DESC' },
    });
    const seenTop = new Set<string>();
    const runnerUpScores = new Map<string, number>();
    for (const row of rows) {
      if (!seenTop.has(row.bankTransactionId)) {
        seenTop.add(row.bankTransactionId);
      } else if (!runnerUpScores.has(row.bankTransactionId)) {
        runnerUpScores.set(row.bankTransactionId, row.totalScore);
      }
    }
    return runnerUpScores;
  }
}
