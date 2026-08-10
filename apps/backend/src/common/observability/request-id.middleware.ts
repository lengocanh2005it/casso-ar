import { randomUUID } from 'node:crypto';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { RequestIdStore } from './request-id.store';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  constructor(private readonly requestIdStore: RequestIdStore) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.headers['x-request-id'];
    const requestId =
      typeof incoming === 'string' && incoming.length > 0
        ? incoming
        : randomUUID();

    res.setHeader('x-request-id', requestId);
    this.requestIdStore.run(requestId, () => next());
  }
}
