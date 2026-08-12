import { ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from './authenticated-user';

export interface AuthRequest extends Request {
  user?: AuthenticatedUser;
}

// Shared by controllers with a route-level :id that must match the caller's
// JWT organizationId (tenant isolation at the presentation layer).
export function assertOrgMatches(
  request: AuthRequest,
  organizationId: string,
): void {
  if (request.user?.organizationId !== organizationId) {
    throw new ForbiddenException('Organization mismatch');
  }
}
