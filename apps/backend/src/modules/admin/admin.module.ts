import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminAuthGuard } from '../../common/admin/admin-auth.guard';
import { getJwtModuleOptions } from '../../config/jwt.config';
import { CopilotModule } from '../copilot/copilot.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { GetAiUsageAggregateUseCase } from './application/get-ai-usage-aggregate.usecase';
import { GetAiUsageTrendUseCase } from './application/get-ai-usage-trend.usecase';
import { ListOrganizationsUseCase } from './application/list-organizations.usecase';
import { LockOrganizationUseCase } from './application/lock-organization.usecase';
import { OPERATOR_AUDIT_LOG_REPOSITORY } from './application/operator-audit-log-repository.port';
import { UnlockOrganizationUseCase } from './application/unlock-organization.usecase';
import { OperatorAuditLogOrmEntity } from './infrastructure/operator-audit-log.orm-entity';
import { TypeOrmOperatorAuditLogRepository } from './infrastructure/typeorm-operator-audit-log.repository';
import { AdminController } from './presentation/admin.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([OperatorAuditLogOrmEntity]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: getJwtModuleOptions,
    }),
    OrganizationsModule,
    CopilotModule,
  ],
  providers: [
    {
      provide: OPERATOR_AUDIT_LOG_REPOSITORY,
      useClass: TypeOrmOperatorAuditLogRepository,
    },
    ListOrganizationsUseCase,
    LockOrganizationUseCase,
    UnlockOrganizationUseCase,
    GetAiUsageAggregateUseCase,
    GetAiUsageTrendUseCase,
    AdminAuthGuard,
  ],
  controllers: [AdminController],
})
export class AdminModule {}
