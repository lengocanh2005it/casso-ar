import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditInterceptor } from './audit.interceptor';
import { AuditContextService } from './audit-context';
import { AuditLogOrmEntity } from './audit-log.orm-entity';
import { AUDIT_LOG_REPOSITORY } from './audit-log-repository.port';
import { TypeOrmAuditLogRepository } from './typeorm-audit-log.repository';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuditLogOrmEntity])],
  providers: [
    { provide: AUDIT_LOG_REPOSITORY, useClass: TypeOrmAuditLogRepository },
    AuditContextService,
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
  exports: [AUDIT_LOG_REPOSITORY, AuditContextService],
})
export class AuditModule {}
