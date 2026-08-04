import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CreateReceivableUseCase } from './application/create-receivable.usecase';
import { RECEIVABLE_REPOSITORY } from './application/receivable-repository.port';
import { ReceivableOrmEntity } from './infrastructure/receivable.orm-entity';
import { TypeOrmReceivableRepository } from './infrastructure/typeorm-receivable.repository';
import { ReceivablesController } from './presentation/receivables.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ReceivableOrmEntity])],
  providers: [
    { provide: RECEIVABLE_REPOSITORY, useClass: TypeOrmReceivableRepository },
    CreateReceivableUseCase,
  ],
  controllers: [ReceivablesController],
  exports: [RECEIVABLE_REPOSITORY, TypeOrmModule, CreateReceivableUseCase],
})
export class ReceivablesModule {}
