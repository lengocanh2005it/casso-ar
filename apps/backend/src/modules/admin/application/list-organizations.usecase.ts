import { Inject, Injectable } from '@nestjs/common';
import {
  type IOrganizationRepository,
  ORGANIZATION_REPOSITORY,
  type OrganizationListItem,
} from '../../organizations/application/organization-repository.port';
import type { OrganizationStatus } from '../../organizations/domain/organization';

export const ADMIN_ORGANIZATION_STATUS_FILTERS = [
  'ALL',
  'ACTIVE',
  'LOCKED',
  'PENDING_REVIEW',
  'REJECTED',
] as const;

export type AdminOrganizationStatusFilter =
  (typeof ADMIN_ORGANIZATION_STATUS_FILTERS)[number];

export interface ListOrganizationsInput {
  page: number;
  limit: number;
  status: AdminOrganizationStatusFilter;
}

export interface ListOrganizationsResult {
  items: OrganizationListItem[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class ListOrganizationsUseCase {
  constructor(
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepo: IOrganizationRepository,
  ) {}

  async execute(
    input: ListOrganizationsInput,
  ): Promise<ListOrganizationsResult> {
    const { items, total } = await this.organizationRepo.findAllPaginated(
      input.page,
      input.limit,
      input.status === 'ALL' ? undefined : (input.status as OrganizationStatus),
    );
    return { items, total, page: input.page, limit: input.limit };
  }
}
