import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
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
