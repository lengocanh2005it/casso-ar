import type { EntityManager } from 'typeorm';
import type { Organization } from '../domain/organization';

export interface IOrganizationRepository {
  findById(id: string): Promise<Organization | null>;
  findAllIds(): Promise<string[]>;
  save(organization: Organization, manager?: EntityManager): Promise<void>;
}

export const ORGANIZATION_REPOSITORY = Symbol('ORGANIZATION_REPOSITORY');
