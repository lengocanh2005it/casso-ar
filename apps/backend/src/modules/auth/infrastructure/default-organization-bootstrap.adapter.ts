import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { IOrganizationBootstrap } from '../application/organization-bootstrap.port';

@Injectable()
export class DefaultOrganizationBootstrap implements IOrganizationBootstrap {
  async seed(_organizationId: string, _manager: EntityManager): Promise<void> {
    // ponytail: no-op until Plans #6/#12 provide the template/reminder tables;
    // those plans rebind this token without changing SignupUseCase.
  }
}
