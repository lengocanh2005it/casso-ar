import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReceivablesModule } from '../receivables/receivables.module';
import { DISPUTE_REPOSITORY } from './application/dispute-repository.port';
import { EVENT_PUBLISHER } from './application/event-publisher.port';
import { OpenDisputeUseCase } from './application/open-dispute.usecase';
import { ResolveDisputeUseCase } from './application/resolve-dispute.usecase';
import { DisputeOrmEntity } from './infrastructure/dispute.orm-entity';
import { NestEventPublisherAdapter } from './infrastructure/nest-event-publisher.adapter';
import { TypeOrmDisputeRepository } from './infrastructure/typeorm-dispute.repository';
import { DisputesController } from './presentation/disputes.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([DisputeOrmEntity]),
    forwardRef(() => ReceivablesModule),
  ],
  providers: [
    { provide: DISPUTE_REPOSITORY, useClass: TypeOrmDisputeRepository },
    { provide: EVENT_PUBLISHER, useClass: NestEventPublisherAdapter },
    OpenDisputeUseCase,
    ResolveDisputeUseCase,
  ],
  controllers: [DisputesController],
  exports: [DISPUTE_REPOSITORY, OpenDisputeUseCase, ResolveDisputeUseCase],
})
export class DisputesModule {}
