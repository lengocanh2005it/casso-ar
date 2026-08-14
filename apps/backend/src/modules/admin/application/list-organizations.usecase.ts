import { Inject, Injectable } from '@nestjs/common';
import {
  type IOrganizationRepository,
  ORGANIZATION_REPOSITORY,
  type OrganizationListItem,
} from '../../organizations/application/organization-repository.port';

export interface ListOrganizationsInput {
  page: number;
  limit: number;
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
    );
    return { items, total, page: input.page, limit: input.limit };
  }
}
