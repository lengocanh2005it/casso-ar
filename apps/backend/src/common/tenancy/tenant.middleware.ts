import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { tenantAsyncStorage } from './tenant-context';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    const organizationId =
      (req.headers['x-organization-id'] as string) ?? 'default';
    const userId = (req.headers['x-user-id'] as string) ?? undefined;

    tenantAsyncStorage.run({ organizationId, userId }, () => {
      next();
    });
  }
}
