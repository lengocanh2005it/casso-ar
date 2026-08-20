import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  CONNECTION_HISTORY_EVENT_TYPES,
  type ConnectionAuditEvent,
} from '../domain/connection-audit-event';
import {
  BANK_CONNECTION_REPOSITORY,
  type IBankConnectionRepository,
} from './bank-connection-repository.port';
import {
  CASSO_FLOW_AUTHORIZATION_REPOSITORY,
  type ICassoFlowAuthorizationRepository,
} from './casso-flow-authorization-repository.port';
import {
  CONNECTION_AUDIT_EVENT_REPOSITORY,
  type IConnectionAuditEventRepository,
} from './connection-audit-event-repository.port';

export interface ListAuthorizationAuditEventsInput {
  organizationId: string;
  cassoFlowAuthorizationId: string;
  page: number;
  limit: number;
}

export interface ListAuthorizationAuditEventsResult {
  items: ConnectionAuditEvent[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class ListAuthorizationAuditEventsUseCase {
  constructor(
    @Inject(CASSO_FLOW_AUTHORIZATION_REPOSITORY)
    private readonly authorizationRepo: ICassoFlowAuthorizationRepository,
    @Inject(BANK_CONNECTION_REPOSITORY)
    private readonly bankConnectionRepo: IBankConnectionRepository,
    @Inject(CONNECTION_AUDIT_EVENT_REPOSITORY)
    private readonly auditEventRepo: IConnectionAuditEventRepository,
  ) {}

  async execute(
    input: ListAuthorizationAuditEventsInput,
  ): Promise<ListAuthorizationAuditEventsResult> {
    const authorization = await this.authorizationRepo.findById(
      input.cassoFlowAuthorizationId,
    );
    if (!authorization) {
      throw new AppError(
        ErrorCode.NOT_FOUND,
        'Không tìm thấy liên kết Casso Flow.',
      );
    }

    const connections = await this.bankConnectionRepo.findByAuthorizationId(
      input.cassoFlowAuthorizationId,
    );
    if (connections.length === 0) {
      return { items: [], total: 0, page: input.page, limit: input.limit };
    }

    const { items, total } = await this.auditEventRepo.findByBankConnectionIds(
      connections.map((connection) => connection.id),
      CONNECTION_HISTORY_EVENT_TYPES,
      input.page,
      input.limit,
    );
    return { items, total, page: input.page, limit: input.limit };
  }
}
