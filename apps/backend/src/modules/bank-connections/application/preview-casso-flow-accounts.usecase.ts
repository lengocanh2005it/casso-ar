import { Inject, Injectable } from '@nestjs/common';
import {
  BANK_CONNECTION_REPOSITORY,
  type IBankConnectionRepository,
} from './bank-connection-repository.port';
import {
  CASSO_FLOW_INTEGRATION_ADAPTER,
  type ICassoFlowIntegrationAdapter,
} from './casso-flow-integration-adapter.port';
import { classifyCassoFlowAccount } from './classify-casso-flow-account';

export type CassoFlowAccountPreviewStatus =
  | 'ALREADY_CONNECTED'
  | 'TAKEN_BY_ANOTHER_ORG'
  | 'AVAILABLE';

export interface CassoFlowAccountPreview {
  accountNumber: string;
  bankName: string;
  accountHolderName: string;
  status: CassoFlowAccountPreviewStatus;
}

export interface PreviewCassoFlowAccountsInput {
  organizationId: string;
  apiKey: string;
}

export interface PreviewCassoFlowAccountsResult {
  businessId: string;
  accounts: CassoFlowAccountPreview[];
}

@Injectable()
export class PreviewCassoFlowAccountsUseCase {
  constructor(
    @Inject(CASSO_FLOW_INTEGRATION_ADAPTER)
    private readonly adapter: ICassoFlowIntegrationAdapter,
    @Inject(BANK_CONNECTION_REPOSITORY)
    private readonly bankConnectionRepo: IBankConnectionRepository,
  ) {}

  async execute(
    input: PreviewCassoFlowAccountsInput,
  ): Promise<PreviewCassoFlowAccountsResult> {
    const { businessId, accounts } = await this.adapter.getAccountInfo(
      input.apiKey,
    );
    const existing = await this.bankConnectionRepo.findByAccountNumbers(
      accounts.map((account) => account.accountNumber),
    );
    return {
      businessId,
      accounts: accounts.map((account) => ({
        ...account,
        status: classifyCassoFlowAccount(
          account.accountNumber,
          input.organizationId,
          existing,
        ),
      })),
    };
  }
}
