import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/authenticated-user';

@Injectable()
export class TenantContextService {
  private readonly storage = new AsyncLocalStorage<AuthenticatedUser>();

  run<T>(user: AuthenticatedUser, callback: () => T): T {
    return this.storage.run(user, callback);
  }

  getCurrentUser(): AuthenticatedUser | undefined {
    return this.storage.getStore();
  }

  getOrganizationId(): string {
    const user = this.getCurrentUser();
    if (!user) {
      throw new Error(
        'TenantContextService accessed outside of an authenticated request',
      );
    }
    return user.organizationId;
  }
}
