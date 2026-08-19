import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  BANK_CONNECTION_REPOSITORY,
  type IBankConnectionRepository,
} from './bank-connection-repository.port';
import {
  CASSO_FLOW_INTEGRATION_ADAPTER,
  type ICassoFlowIntegrationAdapter,
} from './casso-flow-integration-adapter.port';
import { MarkRequiresReauthorizationUseCase } from './mark-requires-reauthorization.usecase';
import { decryptToken } from './token-encryption';
import { ACCESS_TOKEN_ENCRYPTION_KEY } from './token-encryption-key';

@Injectable()
export class SyncTransactionsUseCase {
  constructor(
    @Inject(CASSO_FLOW_INTEGRATION_ADAPTER)
    private readonly adapter: ICassoFlowIntegrationAdapter,
    @Inject(BANK_CONNECTION_REPOSITORY)
    private readonly bankConnectionRepo: IBankConnectionRepository,
    private readonly markRequiresReauthorization: MarkRequiresReauthorizationUseCase,
    @Inject(ACCESS_TOKEN_ENCRYPTION_KEY)
    private readonly encryptionKey: string,
  ) {}

  // Called by a background sync job with only a connectionId (no authenticated
  // request) — findByIdUnscoped is deliberate here, see
  // bank-connection-repository.port.ts.
  async execute(connectionId: string) {
    const connection =
      await this.bankConnectionRepo.findByIdUnscoped(connectionId);
    if (!connection)
      throw new AppError(
        ErrorCode.NOT_FOUND,
        'Không tìm thấy kết nối ngân hàng.',
      );
    try {
      return await this.adapter.getTransactions(
        decryptToken(connection.encryptedCassoApiKey, this.encryptionKey),
      );
    } catch (error) {
      await this.markRequiresReauthorization.handleAdapterError(
        connectionId,
        '401/403 from getTransactions',
        error,
      );
    }
  }
}
