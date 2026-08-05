import type { EntityManager } from 'typeorm';

export interface IOrganizationBootstrap {
  seed(organizationId: string, manager: EntityManager): Promise<void>;
}

export const DEFAULT_ORGANIZATION_BOOTSTRAP = Symbol(
  'DEFAULT_ORGANIZATION_BOOTSTRAP',
);
