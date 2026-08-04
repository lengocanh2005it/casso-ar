import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable, Scope } from '@nestjs/common';

interface TenantStore {
  organizationId: string;
  userId?: string;
}

export const tenantAsyncStorage = new AsyncLocalStorage<TenantStore>();

@Injectable({ scope: Scope.REQUEST })
export class TenantContextService {
  getOrganizationId(): string {
    const store = tenantAsyncStorage.getStore();
    if (!store?.organizationId) {
      throw new Error(
        'Tenant context not initialized — ensure TenantMiddleware is applied',
      );
    }
    return store.organizationId;
  }

  setOrganizationId(id: string): void {
    const store = tenantAsyncStorage.getStore();
    if (store) {
      store.organizationId = id;
    }
  }

  getUserId(): string | undefined {
    const store = tenantAsyncStorage.getStore();
    return store?.userId;
  }

  setUserId(id: string): void {
    const store = tenantAsyncStorage.getStore();
    if (store) {
      store.userId = id;
    }
  }
}
