import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RECEIVABLE_REPOSITORY } from './application/receivable-repository.port';
import { ReceivableOrmEntity } from './infrastructure/receivable.orm-entity';
import { TypeOrmReceivableRepository } from './infrastructure/typeorm-receivable.repository';

@Module({
  imports: [TypeOrmModule.forFeature([ReceivableOrmEntity])],
  providers: [
    { provide: RECEIVABLE_REPOSITORY, useClass: TypeOrmReceivableRepository },
  ],
  exports: [RECEIVABLE_REPOSITORY, TypeOrmModule],
})
export class ReceivablesModule {}
