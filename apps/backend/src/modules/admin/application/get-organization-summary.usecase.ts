import { Inject, Injectable } from '@nestjs/common';
import {
  type IOrganizationRepository,
  ORGANIZATION_REPOSITORY,
} from '../../organizations/application/organization-repository.port';
import type { OrganizationStatus } from '../../organizations/domain/organization';

export interface OrganizationSummary {
  total: number;
  statusCounts: Record<OrganizationStatus, number>;
}

// Counts every organization, not one page of them: the admin dashboard tiles
// describe the whole installation. Deriving them from a list response made
// them silently under-report once an installation outgrew the page limit.
@Injectable()
export class GetOrganizationSummaryUseCase {
  constructor(
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepo: IOrganizationRepository,
  ) {}

  async execute(): Promise<OrganizationSummary> {
    const statusCounts = await this.organizationRepo.countByStatus();
    return {
      total: Object.values(statusCounts).reduce((sum, count) => sum + count, 0),
      statusCounts,
    };
  }
}
