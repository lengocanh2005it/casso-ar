import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { Role } from '../../modules/organizations/domain/membership';
import type { TenantContextService } from './tenant-context';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly tenantContext: TenantContextService) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    const organizationId =
      (req.headers['x-organization-id'] as string) ?? 'default';
    const userId = (req.headers['x-user-id'] as string) ?? 'unknown';
    const role = Role.VIEWER; // Default role for now

    this.tenantContext.run({ userId, organizationId, role }, () => {
      next();
    });
  }
}
