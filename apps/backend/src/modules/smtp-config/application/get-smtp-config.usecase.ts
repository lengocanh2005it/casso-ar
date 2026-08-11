import { Inject, Injectable } from '@nestjs/common';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { OrganizationSmtpConfig } from '../domain/organization-smtp-config';
import {
  type ISmtpConfigRepository,
  SMTP_CONFIG_REPOSITORY,
} from './smtp-config-repository.port';

@Injectable()
export class GetSmtpConfigUseCase {
  constructor(
    @Inject(SMTP_CONFIG_REPOSITORY)
    private readonly smtpConfigRepo: ISmtpConfigRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(): Promise<OrganizationSmtpConfig | null> {
    return this.smtpConfigRepo.findByOrganizationId(
      this.tenantContext.getOrganizationId(),
    );
  }
}
