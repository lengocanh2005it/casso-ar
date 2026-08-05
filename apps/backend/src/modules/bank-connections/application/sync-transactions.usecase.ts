import { Inject, Injectable } from '@nestjs/common';
import {
  BANK_CONNECTION_REPOSITORY,
  type IBankConnectionRepository,
} from './bank-connection-repository.port';
import {
  CAS_ID_INTEGRATION_ADAPTER,
  CasIdUnauthorizedError,
  type ICasIdIntegrationAdapter,
} from './cas-id-integration-adapter.port';
import type { MarkRequiresReauthorizationUseCase } from './mark-requires-reauthorization.usecase';
import { decryptToken } from './token-encryption';

@Injectable()
export class SyncTransactionsUseCase {
  constructor(
    @Inject(CAS_ID_INTEGRATION_ADAPTER)
    private readonly adapter: ICasIdIntegrationAdapter,
    @Inject(BANK_CONNECTION_REPOSITORY)
    private readonly bankConnectionRepo: IBankConnectionRepository,
    private readonly markRequiresReauthorization: MarkRequiresReauthorizationUseCase,
  ) {}

  async execute(connectionId: string) {
    const connection =
      await this.bankConnectionRepo.findByIdUnscoped(connectionId);
    if (!connection) throw new Error('Bank connection not found');
    try {
      return await this.adapter.getTransactions(
        decryptToken(connection.encryptedAccessToken),
      );
    } catch (error) {
      if (error instanceof CasIdUnauthorizedError) {
        await this.markRequiresReauthorization.execute(
          connectionId,
          '401/403 from getTransactions',
        );
      }
      throw error;
    }
  }
}
