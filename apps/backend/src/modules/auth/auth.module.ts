import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { getJwtModuleOptions } from '../../config/jwt.config';
import { BillingModule } from '../billing/billing.module';
import { EmailTemplatesModule } from '../email-templates/email-templates.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { RemindersModule } from '../reminders/reminders.module';
import { UsersModule } from '../users/users.module';
import { AcceptInviteUseCase } from './application/accept-invite.usecase';
import { AUTH_EMAIL_SENDER } from './application/auth-email-sender.port';
import { EMAIL_VERIFICATION_TOKEN_REPOSITORY } from './application/email-verification-token-repository.port';
import { ForgotPasswordUseCase } from './application/forgot-password.usecase';
import { GetUserProfileUseCase } from './application/get-user-profile.usecase';
import { InviteMemberUseCase } from './application/invite-member.usecase';
import { LoginUseCase } from './application/login.usecase';
import { LogoutUseCase } from './application/logout.usecase';
import { MEMBERSHIP_INVITE_REPOSITORY } from './application/membership-invite-repository.port';
import { DEFAULT_ORGANIZATION_BOOTSTRAP } from './application/organization-bootstrap.port';
import { PASSWORD_RESET_TOKEN_REPOSITORY } from './application/password-reset-token-repository.port';
import { RefreshAccessTokenUseCase } from './application/refresh-access-token.usecase';
import { REFRESH_TOKEN_REPOSITORY } from './application/refresh-token-repository.port';
import { ResetPasswordUseCase } from './application/reset-password.usecase';
import { SignupUseCase } from './application/signup.usecase';
import { SwitchOrganizationUseCase } from './application/switch-organization.usecase';
import { TOKEN_SIGNER } from './application/token-signer.port';
import { VerifyEmailUseCase } from './application/verify-email.usecase';
import { DefaultOrganizationBootstrap } from './infrastructure/default-organization-bootstrap.adapter';
import { EmailVerificationTokenOrmEntity } from './infrastructure/email-verification-token.orm-entity';
import { JwtTokenSigner } from './infrastructure/jwt-token-signer.adapter';
import { MembershipInviteOrmEntity } from './infrastructure/membership-invite.orm-entity';
import { PasswordResetTokenOrmEntity } from './infrastructure/password-reset-token.orm-entity';
import { RefreshTokenOrmEntity } from './infrastructure/refresh-token.orm-entity';
import { ResendAuthEmailSenderAdapter } from './infrastructure/resend-auth-email-sender.adapter';
import { TypeOrmEmailVerificationTokenRepository } from './infrastructure/typeorm-email-verification-token.repository';
import { TypeOrmMembershipInviteRepository } from './infrastructure/typeorm-membership-invite.repository';
import { TypeOrmPasswordResetTokenRepository } from './infrastructure/typeorm-password-reset-token.repository';
import { TypeOrmRefreshTokenRepository } from './infrastructure/typeorm-refresh-token.repository';
import { AuthController } from './presentation/auth.controller';
import { InvitesController } from './presentation/invites.controller';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: getJwtModuleOptions,
    }),
    TypeOrmModule.forFeature([
      EmailVerificationTokenOrmEntity,
      PasswordResetTokenOrmEntity,
      MembershipInviteOrmEntity,
      RefreshTokenOrmEntity,
    ]),
    UsersModule,
    OrganizationsModule,
    BillingModule,
    EmailTemplatesModule,
    NotificationsModule,
    RemindersModule,
  ],
  providers: [
    LoginUseCase,
    SignupUseCase,
    VerifyEmailUseCase,
    AcceptInviteUseCase,
    GetUserProfileUseCase,
    ForgotPasswordUseCase,
    InviteMemberUseCase,
    LogoutUseCase,
    RefreshAccessTokenUseCase,
    ResetPasswordUseCase,
    SwitchOrganizationUseCase,
    {
      provide: EMAIL_VERIFICATION_TOKEN_REPOSITORY,
      useClass: TypeOrmEmailVerificationTokenRepository,
    },
    {
      provide: PASSWORD_RESET_TOKEN_REPOSITORY,
      useClass: TypeOrmPasswordResetTokenRepository,
    },
    {
      provide: MEMBERSHIP_INVITE_REPOSITORY,
      useClass: TypeOrmMembershipInviteRepository,
    },
    {
      provide: REFRESH_TOKEN_REPOSITORY,
      useClass: TypeOrmRefreshTokenRepository,
    },
    { provide: AUTH_EMAIL_SENDER, useClass: ResendAuthEmailSenderAdapter },
    {
      provide: DEFAULT_ORGANIZATION_BOOTSTRAP,
      useClass: DefaultOrganizationBootstrap,
    },
    { provide: TOKEN_SIGNER, useClass: JwtTokenSigner },
  ],
  controllers: [AuthController, InvitesController],
})
export class AuthModule {}
