import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtStrategy } from './common/auth/jwt.strategy';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard';
import { IdempotencyModule } from './common/idempotency/idempotency.module';
import { TenancyModule } from './common/tenancy/tenancy.module';
import { TenantContextInterceptor } from './common/tenancy/tenant-context.interceptor';
import { getJwtSecret } from './config/jwt.config';
import { getTypeOrmConfig } from './config/typeorm.config';
import { CustomersModule } from './modules/customers/customers.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ReceivablesModule } from './modules/receivables/receivables.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({ useFactory: () => getTypeOrmConfig() }),
    PassportModule,
    JwtModule.register({
      secret: getJwtSecret(),
      signOptions: { expiresIn: '15m' },
    }),
    TenancyModule,
    IdempotencyModule,
    OrganizationsModule,
    CustomersModule,
    InvoicesModule,
    ReceivablesModule,
    PaymentsModule,
  ],
  providers: [
    JwtStrategy,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
  ],
})
export class AppModule {}
