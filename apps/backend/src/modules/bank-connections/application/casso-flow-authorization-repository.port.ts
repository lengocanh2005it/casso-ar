import type { EntityManager } from 'typeorm';
import type { CassoFlowAuthorization } from '../domain/casso-flow-authorization';

export interface ICassoFlowAuthorizationRepository {
  // Unscoped on purpose: called from ReceiveWebhookUseCase, which handles an
  // inbound Casso Flow webhook — there is no TenantContextService
  // organizationId at that point. The connection is resolved first (by
  // accountNumber, itself unscoped for the same reason), then its
  // authorization is looked up by id from that already-resolved connection.
  findByIdUnscoped(id: string): Promise<CassoFlowAuthorization | null>;
  findById(id: string): Promise<CassoFlowAuthorization | null>;
  findByIdForUpdate(
    id: string,
    manager: EntityManager,
  ): Promise<CassoFlowAuthorization | null>;
  findByBusinessIdForOrganization(
    businessId: string,
    organizationId: string,
  ): Promise<CassoFlowAuthorization | null>;
  save(
    authorization: CassoFlowAuthorization,
    manager?: EntityManager,
  ): Promise<void>;
}

export const CASSO_FLOW_AUTHORIZATION_REPOSITORY = Symbol(
  'CASSO_FLOW_AUTHORIZATION_REPOSITORY',
);
