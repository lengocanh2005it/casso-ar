import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  type IOrganizationRepository,
  ORGANIZATION_REPOSITORY,
} from '../../organizations/application/organization-repository.port';
import type { Organization } from '../../organizations/domain/organization';

export interface GetOrganizationInput {
  organizationId: string;
}

@Injectable()
export class GetOrganizationUseCase {
  constructor(
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepo: IOrganizationRepository,
  ) {}

  async execute(input: GetOrganizationInput): Promise<Organization> {
    const organization = await this.organizationRepo.findById(
      input.organizationId,
    );
    if (!organization) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy tổ chức.');
    }
    return organization;
  }
}
