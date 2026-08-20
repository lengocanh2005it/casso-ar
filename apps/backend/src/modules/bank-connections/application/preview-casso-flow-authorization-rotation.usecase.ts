import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import type { BankConnection } from '../domain/bank-connection';
import {
  BANK_CONNECTION_REPOSITORY,
  type IBankConnectionRepository,
} from './bank-connection-repository.port';
import {
  CASSO_FLOW_AUTHORIZATION_REPOSITORY,
  type ICassoFlowAuthorizationRepository,
} from './casso-flow-authorization-repository.port';
import {
  CASSO_FLOW_INTEGRATION_ADAPTER,
  type ICassoFlowIntegrationAdapter,
} from './casso-flow-integration-adapter.port';
import type {
  CassoFlowAccountPreview,
  CassoFlowAccountPreviewStatus,
} from './preview-casso-flow-accounts.usecase';

export interface PreviewCassoFlowAuthorizationRotationInput {
  organizationId: string;
  cassoFlowAuthorizationId: string;
  apiKey: string;
}

export interface PreviewCassoFlowAuthorizationRotationResult {
  businessId: string;
  accounts: CassoFlowAccountPreview[];
  missingAccountNumbers: string[];
}

@Injectable()
export class PreviewCassoFlowAuthorizationRotationUseCase {
  constructor(
    @Inject(CASSO_FLOW_INTEGRATION_ADAPTER)
    private readonly adapter: ICassoFlowIntegrationAdapter,
    @Inject(BANK_CONNECTION_REPOSITORY)
    private readonly bankConnectionRepo: IBankConnectionRepository,
    @Inject(CASSO_FLOW_AUTHORIZATION_REPOSITORY)
    private readonly authorizationRepo: ICassoFlowAuthorizationRepository,
  ) {}

  async execute(
    input: PreviewCassoFlowAuthorizationRotationInput,
  ): Promise<PreviewCassoFlowAuthorizationRotationResult> {
    const authorization = await this.authorizationRepo.findById(
      input.cassoFlowAuthorizationId,
    );
    if (!authorization) {
      throw new AppError(
        ErrorCode.NOT_FOUND,
        'Không tìm thấy liên kết Casso Flow.',
      );
    }

    const { businessId, accounts } = await this.adapter.getAccountInfo(
      input.apiKey,
    );

    if (
      authorization.businessId !== null &&
      authorization.businessId !== businessId
    ) {
      throw new AppError(
        ErrorCode.CONFLICT,
        'Mã doanh nghiệp từ API Key mới không khớp với liên kết hiện tại. Dùng nút "Kết nối ngân hàng" nếu muốn thêm một liên kết mới.',
        { rowErrorCode: 'BUSINESS_ID_MISMATCH' },
      );
    }

    const existing = await this.bankConnectionRepo.findByAccountNumbers(
      accounts.map((account) => account.accountNumber),
    );
    const currentConnections =
      await this.bankConnectionRepo.findByAuthorizationId(
        input.cassoFlowAuthorizationId,
      );
    const newAccountNumbers = new Set(
      accounts.map((account) => account.accountNumber),
    );
    const missingAccountNumbers = currentConnections
      .filter((connection) => !newAccountNumbers.has(connection.accountNumber))
      .map((connection) => connection.accountNumber);

    return {
      businessId,
      accounts: accounts.map((account) => ({
        ...account,
        status: this.classify(
          account.accountNumber,
          input.organizationId,
          existing,
        ),
      })),
      missingAccountNumbers,
    };
  }

  private classify(
    accountNumber: string,
    organizationId: string,
    existing: Map<string, BankConnection>,
  ): CassoFlowAccountPreviewStatus {
    const row = existing.get(accountNumber);
    if (!row) return 'AVAILABLE';
    return row.organizationId === organizationId
      ? 'ALREADY_CONNECTED'
      : 'TAKEN_BY_ANOTHER_ORG';
  }
}
