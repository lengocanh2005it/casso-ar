import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtStrategy } from './common/auth/jwt.strategy';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard';
import { TenantContextService } from './common/tenancy/tenant-context';
import { TenantContextInterceptor } from './common/tenancy/tenant-context.interceptor';
import { typeOrmConfig } from './config/typeorm.config';
import { CustomersModule } from './modules/customers/customers.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ReceivablesModule } from './modules/receivables/receivables.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot(typeOrmConfig),
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'dev-only-change-me',
      signOptions: { expiresIn: '15m' },
    }),
    OrganizationsModule,
    CustomersModule,
    ReceivablesModule,
    PaymentsModule,
  ],
  providers: [
    JwtStrategy,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    TenantContextService,
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
  ],
  exports: [TenantContextService],
})
export class AppModule {}
