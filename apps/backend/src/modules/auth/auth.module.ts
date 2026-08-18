import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { getJwtModuleOptions } from '../../config/jwt.config';
import { BankConnectionsModule } from '../bank-connections/bank-connections.module';
import { BillingModule } from '../billing/billing.module';
import { EmailTemplatesModule } from '../email-templates/email-templates.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { CHANGE_PASSWORD_OTP_REPOSITORY } from '../profile/application/change-password-otp-repository.port';
import { ChangePasswordOtpOrmEntity } from '../profile/infrastructure/change-password-otp.orm-entity';
import { TypeOrmChangePasswordOtpRepository } from '../profile/infrastructure/typeorm-change-password-otp.repository';
import { RemindersModule } from '../reminders/reminders.module';
import { UsersModule } from '../users/users.module';
import { AcceptInviteUseCase } from './application/accept-invite.usecase';
import { AUTH_EMAIL_SENDER } from './application/auth-email-sender.port';
import { BlockMemberUseCase } from './application/block-member.usecase';
import { ChangePasswordConfirmUseCase } from './application/change-password-confirm.usecase';
import { ChangePasswordRequestUseCase } from './application/change-password-request.usecase';
import { ChangePasswordResendUseCase } from './application/change-password-resend.usecase';
import { DeleteInviteUseCase } from './application/delete-invite.usecase';
import { EMAIL_VERIFICATION_TOKEN_REPOSITORY } from './application/email-verification-token-repository.port';
import { ForgotPasswordUseCase } from './application/forgot-password.usecase';
import { GetUserProfileUseCase } from './application/get-user-profile.usecase';
import { InviteMemberUseCase } from './application/invite-member.usecase';
import { ListInvitesUseCase } from './application/list-invites.usecase';
import { LoginUseCase } from './application/login.usecase';
import { LogoutUseCase } from './application/logout.usecase';
import { MEMBER_NOTIFICATION_SENDER } from './application/member-notification.port';
import { MEMBERSHIP_INVITE_REPOSITORY } from './application/membership-invite-repository.port';
import { DEFAULT_ORGANIZATION_BOOTSTRAP } from './application/organization-bootstrap.port';
import { PASSWORD_RESET_TOKEN_REPOSITORY } from './application/password-reset-token-repository.port';
import { RefreshAccessTokenUseCase } from './application/refresh-access-token.usecase';
import { REFRESH_TOKEN_REPOSITORY } from './application/refresh-token-repository.port';
import { RemoveMemberUseCase } from './application/remove-member.usecase';
import { ResendInviteUseCase } from './application/resend-invite.usecase';
import { ResendVerificationEmailUseCase } from './application/resend-verification-email.usecase';
import { ResetPasswordUseCase } from './application/reset-password.usecase';
import { SignupUseCase } from './application/signup.usecase';
import { SwitchOrganizationUseCase } from './application/switch-organization.usecase';
import { TOKEN_SIGNER } from './application/token-signer.port';
import { UnblockMemberUseCase } from './application/unblock-member.usecase';
import { UpdateProfileUseCase } from './application/update-profile.usecase';
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
      ChangePasswordOtpOrmEntity,
    ]),
    UsersModule,
    OrganizationsModule,
    BillingModule,
    BankConnectionsModule,
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
    ListInvitesUseCase,
    DeleteInviteUseCase,
    ResendInviteUseCase,
    RemoveMemberUseCase,
    BlockMemberUseCase,
    UnblockMemberUseCase,
    LogoutUseCase,
    RefreshAccessTokenUseCase,
    ResendVerificationEmailUseCase,
    ResetPasswordUseCase,
    SwitchOrganizationUseCase,
    UpdateProfileUseCase,
    ChangePasswordRequestUseCase,
    ChangePasswordConfirmUseCase,
    ChangePasswordResendUseCase,
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
      provide: MEMBER_NOTIFICATION_SENDER,
      useClass: ResendAuthEmailSenderAdapter,
    },
    {
      provide: DEFAULT_ORGANIZATION_BOOTSTRAP,
      useClass: DefaultOrganizationBootstrap,
    },
    { provide: TOKEN_SIGNER, useClass: JwtTokenSigner },
    {
      provide: CHANGE_PASSWORD_OTP_REPOSITORY,
      useClass: TypeOrmChangePasswordOtpRepository,
    },
  ],
  controllers: [AuthController, InvitesController],
  exports: [
    AUTH_EMAIL_SENDER,
    MEMBER_NOTIFICATION_SENDER,
    MEMBERSHIP_INVITE_REPOSITORY,
  ],
})
export class AuthModule {}
