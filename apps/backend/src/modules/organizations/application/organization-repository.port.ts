import type { EntityManager } from 'typeorm';
import type { Organization, OrganizationStatus } from '../domain/organization';

// Stable row-error code returned to the FE when a tax code collides with an
// existing organization (any status).
export const DUPLICATE_TAX_CODE = 'DUPLICATE_TAX_CODE';

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
  countByStatus(): Promise<Record<OrganizationStatus, number>>;
  findAllPaginated(
    page: number,
    limit: number,
    status?: OrganizationStatus,
  ): Promise<{ items: OrganizationListItem[]; total: number }>;
  findByIds(ids: string[]): Promise<Map<string, Organization>>;
  findByTaxCode(
    taxCode: string,
    manager?: EntityManager,
  ): Promise<Organization | null>;
  save(organization: Organization, manager?: EntityManager): Promise<void>;
}

export const ORGANIZATION_REPOSITORY = Symbol('ORGANIZATION_REPOSITORY');
