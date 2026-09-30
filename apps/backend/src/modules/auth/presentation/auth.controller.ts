import { Permission } from '@casso-ar/shared-types';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  AuditActionType,
  AuditEntityType,
} from '../../../common/audit/audit.enums';
import { Audited } from '../../../common/audit/audited.decorator';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { Public } from '../../../common/auth/public.decorator';
import { ErrorCode } from '../../../common/errors/error-code';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { ApiErrorResponse } from '../../../common/swagger/api-error-response.decorator';
import { successResponseSchema } from '../../../common/swagger/success-response-schema';
import { ChangePasswordConfirmUseCase } from '../application/change-password-confirm.usecase';
import { ChangePasswordRequestUseCase } from '../application/change-password-request.usecase';
import { ChangePasswordResendUseCase } from '../application/change-password-resend.usecase';
import { ForgotPasswordUseCase } from '../application/forgot-password.usecase';
import { GetUserProfileUseCase } from '../application/get-user-profile.usecase';
import { LoginUseCase } from '../application/login.usecase';
import { LogoutUseCase } from '../application/logout.usecase';
import { RefreshAccessTokenUseCase } from '../application/refresh-access-token.usecase';
import { ResendVerificationEmailUseCase } from '../application/resend-verification-email.usecase';
import { ResetPasswordUseCase } from '../application/reset-password.usecase';
import { SignupUseCase } from '../application/signup.usecase';
import { SwitchOrganizationUseCase } from '../application/switch-organization.usecase';
import { UpdateProfileUseCase } from '../application/update-profile.usecase';
import { VerifyEmailUseCase } from '../application/verify-email.usecase';
import { REFRESH_TOKEN_TTL_MS } from '../refresh-token-ttl';
import { AuthCompositeRateLimitGuard } from './auth-composite-rate-limit.guard';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SignupDto } from './dto/signup.dto';
import { SwitchOrganizationDto } from './dto/switch-organization.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import {
  toUserProfileResponse,
  UserProfileResponseDto,
} from './dto/user-profile-response.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';

const REFRESH_COOKIE_NAME = 'refreshToken';
interface AuthRequest extends Request {
  user?: { userId: string };
}

interface RefreshCookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  maxAge: number;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly signupUseCase: SignupUseCase,
    private readonly verifyEmailUseCase: VerifyEmailUseCase,
    private readonly loginUseCase: LoginUseCase,
    private readonly refreshAccessTokenUseCase: RefreshAccessTokenUseCase,
    private readonly logoutUseCase: LogoutUseCase,
    private readonly switchOrganizationUseCase: SwitchOrganizationUseCase,
    private readonly forgotPasswordUseCase: ForgotPasswordUseCase,
    private readonly resetPasswordUseCase: ResetPasswordUseCase,
    private readonly getUserProfileUseCase: GetUserProfileUseCase,
    private readonly updateProfileUseCase: UpdateProfileUseCase,
    private readonly changePasswordRequestUseCase: ChangePasswordRequestUseCase,
    private readonly changePasswordConfirmUseCase: ChangePasswordConfirmUseCase,
    private readonly changePasswordResendUseCase: ChangePasswordResendUseCase,
    private readonly resendVerificationEmailUseCase: ResendVerificationEmailUseCase,
    config: ConfigService,
  ) {
    this.refreshCookieOptions = {
      httpOnly: true,
      secure: config.get<string>('NODE_ENV', 'development') === 'production',
      sameSite: 'lax',
      maxAge: REFRESH_TOKEN_TTL_MS,
    };
  }

  private readonly refreshCookieOptions: RefreshCookieOptions;

  @Public()
  @UseGuards(AuthCompositeRateLimitGuard)
  @Post('signup')
  @ApiOperation({ summary: 'Sign up a new user and organization' })
  @ApiCreatedResponse({
    description:
      'Signup accepted. Email verification (a 6-digit OTP) is required before the organization and account are created.',
    schema: successResponseSchema(),
  })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.CONFLICT,
    ErrorCode.RATE_LIMIT_EXCEEDED,
  )
  async signup(@Body() dto: SignupDto) {
    await this.signupUseCase.execute(dto);
    return { success: true };
  }

  @Public()
  @UseGuards(AuthCompositeRateLimitGuard)
  @HttpCode(HttpStatus.OK)
  @Post('verify-email')
  @ApiOperation({ summary: 'Verify an email with a 6-digit OTP' })
  @ApiOkResponse({
    description: 'Email verified',
    schema: {
      type: 'object',
      required: ['verified', 'accessToken'],
      properties: {
        verified: { type: 'boolean', example: true },
        accessToken: { type: 'string' },
      },
    },
  })
  @ApiErrorResponse(ErrorCode.VALIDATION_ERROR, ErrorCode.UNAUTHORIZED)
  async verifyEmail(
    @Body() dto: VerifyEmailDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.verifyEmailUseCase.execute(dto.email, dto.otp);
    response.cookie(
      REFRESH_COOKIE_NAME,
      result.refreshToken,
      this.refreshCookieOptions,
    );
    return { verified: true, accessToken: result.accessToken };
  }

  @Public()
  @UseGuards(AuthCompositeRateLimitGuard)
  @HttpCode(HttpStatus.OK)
  @Post('resend-verification')
  @ApiOperation({ summary: 'Resend the email verification OTP' })
  @ApiOkResponse({
    description: 'Verification email sent if the address requires it',
    schema: successResponseSchema(),
  })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.RATE_LIMIT_EXCEEDED,
    ErrorCode.EMAIL_SEND_FAILED,
  )
  async resendVerification(@Body() dto: ForgotPasswordDto) {
    await this.resendVerificationEmailUseCase.execute(dto.email);
    return { success: true };
  }

  @Public()
  @UseGuards(AuthCompositeRateLimitGuard)
  @Audited(AuditActionType.AUTH_LOGIN, AuditEntityType.AUTH)
  @Post('login')
  @ApiOperation({ summary: 'Log in with email and password' })
  @ApiCreatedResponse({
    description:
      'Access token returned; refresh token set as an httpOnly cookie (refreshToken)',
    schema: {
      type: 'object',
      required: ['accessToken'],
      properties: { accessToken: { type: 'string' } },
    },
  })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
    ErrorCode.EMAIL_NOT_VERIFIED,
    ErrorCode.RATE_LIMIT_EXCEEDED,
  )
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.loginUseCase.execute(dto);
    response.cookie(
      REFRESH_COOKIE_NAME,
      result.refreshToken,
      this.refreshCookieOptions,
    );
    return { accessToken: result.accessToken };
  }

  @Public()
  // Deliberately not AuthCompositeRateLimitGuard: refresh runs on every full
  // page load, so the 20-per-15-minute `ip` budget and the shared auth
  // abuse-escalation lockout both misfire on normal traffic — a reloading user
  // or an office NAT gets logged out, then locked out of login as well (#410).
  // Refresh keeps only the `default` 100/min per IP flood cap, keyed by IP
  // because token rotation makes a cookie-based key unstable. ADR-0030.
  @SkipThrottle({ ip: true })
  @UseGuards(ThrottlerGuard)
  @Post('refresh')
  @ApiOperation({
    summary: 'Refresh the access token using the refresh cookie',
  })
  @ApiCreatedResponse({
    description:
      'New access token returned; refresh token rotated as an httpOnly cookie',
    schema: {
      type: 'object',
      required: ['accessToken'],
      properties: { accessToken: { type: 'string' } },
    },
  })
  @ApiErrorResponse(
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
    ErrorCode.RATE_LIMIT_EXCEEDED,
  )
  async refresh(
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.refreshAccessTokenUseCase.execute(
      request.cookies?.[REFRESH_COOKIE_NAME],
    );
    response.cookie(
      REFRESH_COOKIE_NAME,
      result.refreshToken,
      this.refreshCookieOptions,
    );
    return { accessToken: result.accessToken };
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Audited(AuditActionType.AUTH_LOGOUT, AuditEntityType.AUTH)
  @Post('logout')
  @ApiOperation({ summary: 'Log out and clear the refresh cookie' })
  @ApiOkResponse({
    description: 'Logged out; refresh cookie cleared',
    schema: successResponseSchema(),
  })
  async logout(
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.logoutUseCase.execute(request.cookies?.[REFRESH_COOKIE_NAME]);
    response.clearCookie(REFRESH_COOKIE_NAME, this.refreshCookieOptions);
    return { success: true };
  }

  @Post('switch-organization')
  @ApiOperation({ summary: 'Switch the active organization' })
  @ApiCreatedResponse({
    description: 'New access token for the target organization',
    schema: {
      type: 'object',
      required: ['accessToken'],
      properties: { accessToken: { type: 'string' } },
    },
  })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
  )
  @Audited(AuditActionType.AUTH_SWITCH_ORGANIZATION, AuditEntityType.AUTH)
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission(Permission.SWITCH_ORGANIZATION)
  async switchOrganization(
    @Req() request: AuthRequest,
    @Body() dto: SwitchOrganizationDto,
  ) {
    const userId = request.user?.userId;
    if (!userId) {
      throw new UnauthorizedException();
    }
    return this.switchOrganizationUseCase.execute(userId, dto.organizationId);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get the current user profile' })
  @ApiOkResponse({ type: UserProfileResponseDto })
  @ApiErrorResponse(
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
    ErrorCode.NOT_FOUND,
  )
  @UseGuards(JwtAuthGuard)
  async getMe(@Req() request: AuthRequest): Promise<UserProfileResponseDto> {
    const userId = request.user?.userId;
    if (!userId) {
      throw new UnauthorizedException();
    }
    const result = await this.getUserProfileUseCase.execute(userId);
    return toUserProfileResponse(result);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update user profile' })
  @ApiOkResponse({ type: UserProfileResponseDto })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
  )
  @UseGuards(JwtAuthGuard)
  async updateMe(
    @Req() request: AuthRequest,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserProfileResponseDto> {
    const userId = request.user?.userId;
    if (!userId) {
      throw new UnauthorizedException();
    }
    const profile = await this.getUserProfileUseCase.execute(userId);
    await this.updateProfileUseCase.execute({
      userId,
      name: dto.name,
      organizationName: dto.organizationName,
      role: profile.role,
    });
    const updated = await this.getUserProfileUseCase.execute(userId);
    return toUserProfileResponse(updated);
  }

  @Post('change-password/request')
  @ApiOperation({ summary: 'Request OTP for password change' })
  @ApiCreatedResponse({
    description: 'OTP sent to email',
    schema: successResponseSchema(),
  })
  @ApiErrorResponse(ErrorCode.VALIDATION_ERROR, ErrorCode.UNAUTHORIZED)
  @UseGuards(JwtAuthGuard)
  async requestChangePassword(
    @Req() request: AuthRequest,
    @Body() body: { currentPassword: string },
  ) {
    const userId = request.user?.userId;
    if (!userId) {
      throw new UnauthorizedException();
    }
    await this.changePasswordRequestUseCase.execute(
      userId,
      body.currentPassword,
    );
    return { success: true };
  }

  @Post('change-password/confirm')
  @ApiOperation({ summary: 'Confirm new password with OTP' })
  @ApiCreatedResponse({
    description: 'Password changed',
    schema: successResponseSchema(),
  })
  @ApiErrorResponse(ErrorCode.VALIDATION_ERROR, ErrorCode.UNAUTHORIZED)
  @UseGuards(JwtAuthGuard)
  async confirmChangePassword(
    @Req() request: AuthRequest,
    @Body() body: { otp: string; newPassword: string },
  ) {
    const userId = request.user?.userId;
    if (!userId) {
      throw new UnauthorizedException();
    }
    await this.changePasswordConfirmUseCase.execute(
      userId,
      body.otp,
      body.newPassword,
    );
    return { success: true };
  }

  @Post('change-password/resend')
  @ApiOperation({ summary: 'Resend change password OTP' })
  @ApiCreatedResponse({
    description: 'OTP resent',
    schema: successResponseSchema(),
  })
  @ApiErrorResponse(ErrorCode.VALIDATION_ERROR, ErrorCode.UNAUTHORIZED)
  @UseGuards(JwtAuthGuard)
  async resendChangePasswordOtp(@Req() request: AuthRequest) {
    const userId = request.user?.userId;
    if (!userId) {
      throw new UnauthorizedException();
    }
    await this.changePasswordResendUseCase.execute(userId);
    return { success: true };
  }

  @Public()
  @UseGuards(AuthCompositeRateLimitGuard)
  @Audited(AuditActionType.AUTH_FORGOT_PASSWORD, AuditEntityType.AUTH)
  @HttpCode(HttpStatus.OK)
  @Post('forgot-password')
  @ApiOperation({ summary: 'Request a password reset email' })
  @ApiOkResponse({
    description: 'Reset email sent if the address exists',
    schema: successResponseSchema(),
  })
  @ApiErrorResponse(ErrorCode.VALIDATION_ERROR, ErrorCode.RATE_LIMIT_EXCEEDED)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.forgotPasswordUseCase.execute(dto.email);
    return { success: true };
  }

  @Public()
  @UseGuards(AuthCompositeRateLimitGuard)
  @Audited(AuditActionType.AUTH_RESET_PASSWORD, AuditEntityType.AUTH)
  @Post('reset-password')
  @ApiOperation({ summary: 'Reset the password with a token' })
  @ApiCreatedResponse({
    description: 'Password reset',
    schema: successResponseSchema(),
  })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.NOT_FOUND,
    ErrorCode.RATE_LIMIT_EXCEEDED,
  )
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.resetPasswordUseCase.execute(dto);
    return { success: true };
  }
}
