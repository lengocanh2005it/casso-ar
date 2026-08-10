import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';

@Injectable()
export class RequestIdStore {
  private readonly storage = new AsyncLocalStorage<string>();

  run<T>(requestId: string, callback: () => T): T {
    return this.storage.run(requestId, callback);
  }

  getRequestId(): string | undefined {
    return this.storage.getStore();
  }
}
