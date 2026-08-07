import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';

interface AuditStore {
  before: unknown;
}

@Injectable()
export class AuditContextService {
  private readonly storage = new AsyncLocalStorage<AuditStore>();

  run<T>(callback: () => T): T {
    return this.storage.run({ before: null }, callback);
  }

  setBefore(value: unknown): void {
    const store = this.storage.getStore();
    if (store) store.before = value;
  }

  getBefore(): unknown {
    return this.storage.getStore()?.before ?? null;
  }
}
