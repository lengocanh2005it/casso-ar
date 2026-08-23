import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { reclaimIfExpired } from '../../ownership-transfer/application/reclaim-if-expired';
import {
  OWNERSHIP_TRANSFER_REQUEST_REPOSITORY,
  type IOwnershipTransferRequestRepository,
} from '../../ownership-transfer/application/ownership-transfer-request-repository.port';
import type { OwnershipTransferRequest } from '../../ownership-transfer/domain/ownership-transfer-request';

@Injectable()
export class GetCurrentOwnershipTransferUseCase {
  constructor(
    @Inject(OWNERSHIP_TRANSFER_REQUEST_REPOSITORY)
    private readonly requestRepo: IOwnershipTransferRequestRepository,
    private readonly dataSource: DataSource,
  ) {}

  async execute(
    organizationId: string,
  ): Promise<OwnershipTransferRequest | null> {
    return this.dataSource.transaction(async (manager) => {
      const request = await this.requestRepo.findNonTerminalByOrganization(
        organizationId,
        manager,
      );
      if (!request) return null;
      const reclaimed = await reclaimIfExpired(
        this.requestRepo,
        request,
        manager,
      );
      return reclaimed.isNonTerminal() ? reclaimed : null;
    });
  }
}
