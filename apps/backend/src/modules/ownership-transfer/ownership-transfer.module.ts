import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OWNERSHIP_TRANSFER_REQUEST_REPOSITORY } from './application/ownership-transfer-request-repository.port';
import { OwnershipTransferRequestOrmEntity } from './infrastructure/ownership-transfer-request.orm-entity';
import { TypeOrmOwnershipTransferRequestRepository } from './infrastructure/typeorm-ownership-transfer-request.repository';

@Module({
  imports: [TypeOrmModule.forFeature([OwnershipTransferRequestOrmEntity])],
  providers: [
    {
      provide: OWNERSHIP_TRANSFER_REQUEST_REPOSITORY,
      useClass: TypeOrmOwnershipTransferRequestRepository,
    },
  ],
  exports: [OWNERSHIP_TRANSFER_REQUEST_REPOSITORY],
})
export class OwnershipTransferModule {}
