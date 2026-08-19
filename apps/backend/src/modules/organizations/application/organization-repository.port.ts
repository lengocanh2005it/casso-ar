import type { EntityManager } from 'typeorm';
import type { Organization, OrganizationStatus } from '../domain/organization';

export interface OrganizationListItem {
  id: string;
  name: string;
  status: OrganizationStatus;
  taxCode: string;
  taxCodeMatched: boolean;
  taxCodeLookupName: string | null;
  createdAt: Date;
}

export interface IOrganizationRepository {
  findById(id: string, manager?: EntityManager): Promise<Organization | null>;
  findAllIds(): Promise<string[]>;
  findAllPaginated(
    page: number,
    limit: number,
    status?: OrganizationStatus,
  ): Promise<{ items: OrganizationListItem[]; total: number }>;
  findByIds(ids: string[]): Promise<Map<string, Organization>>;
  save(organization: Organization, manager?: EntityManager): Promise<void>;
}

export const ORGANIZATION_REPOSITORY = Symbol('ORGANIZATION_REPOSITORY');
