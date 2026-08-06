import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';

interface AuditStore {
  before: unknown;
  after: unknown;
}

@Injectable()
export class AuditContextService {
  private readonly storage = new AsyncLocalStorage<AuditStore>();

  run<T>(callback: () => T): T {
    return this.storage.run({ before: null, after: null }, callback);
  }

  setBefore(value: unknown): void {
    const store = this.storage.getStore();
    if (store) store.before = value;
  }

  getBefore(): unknown {
    return this.storage.getStore()?.before ?? null;
  }

  setAfter(value: unknown): void {
    const store = this.storage.getStore();
    if (store) store.after = value;
  }

  getAfter(): unknown {
    return this.storage.getStore()?.after ?? null;
  }
}
