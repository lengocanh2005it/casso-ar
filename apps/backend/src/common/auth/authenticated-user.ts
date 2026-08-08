import type { Role } from '../../modules/organizations/domain/membership';

export interface AuthenticatedUser {
  userId: string;
  organizationId: string;
  role: Role;
  requestId?: string;
}
