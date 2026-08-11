import { Inject, Injectable } from '@nestjs/common';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import {
  type ISmtpConfigRepository,
  SMTP_CONFIG_REPOSITORY,
} from './smtp-config-repository.port';

@Injectable()
export class DeleteSmtpConfigUseCase {
  constructor(
    @Inject(SMTP_CONFIG_REPOSITORY)
    private readonly smtpConfigRepo: ISmtpConfigRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(): Promise<void> {
    await this.smtpConfigRepo.deleteByOrganizationId(
      this.tenantContext.getOrganizationId(),
    );
  }
}
