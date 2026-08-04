import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdempotencyService } from './idempotency.service';
import { IdempotencyKeyOrmEntity } from './idempotency-key.orm-entity';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([IdempotencyKeyOrmEntity])],
  providers: [IdempotencyService],
  exports: [IdempotencyService],
})
export class IdempotencyModule {}
