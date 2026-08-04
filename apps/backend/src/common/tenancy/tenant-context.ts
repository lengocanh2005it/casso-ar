import { Injectable } from '@nestjs/common';

@Injectable()
export class TenantContextService {
  private organizationId = 'default';

  getOrganizationId(): string {
    return this.organizationId;
  }

  setOrganizationId(id: string): void {
    this.organizationId = id;
  }
}
