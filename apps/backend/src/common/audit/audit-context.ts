import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';

interface AuditStore {
  before: unknown;
  afterStatePatch: Record<string, unknown> | null;
}

@Injectable()
export class AuditContextService {
  private readonly storage = new AsyncLocalStorage<AuditStore>();

  run<T>(callback: () => T): T {
    return this.storage.run({ before: null, afterStatePatch: null }, callback);
  }

  setBefore(value: unknown): void {
    const store = this.storage.getStore();
    if (store) store.before = value;
  }

  getBefore(): unknown {
    return this.storage.getStore()?.before ?? null;
  }

  setAfterStatePatch(patch: Record<string, unknown>): void {
    const store = this.storage.getStore();
    if (!store) return;
    store.afterStatePatch = { ...(store.afterStatePatch ?? {}), ...patch };
  }

  getAfterStatePatch(): Record<string, unknown> | null {
    return this.storage.getStore()?.afterStatePatch ?? null;
  }
}
