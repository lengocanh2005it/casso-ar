import { Permission } from '@casso-ledger/shared-types';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import {
  AuditActionType,
  AuditEntityType,
} from '../../../common/audit/audit.enums';
import { Audited } from '../../../common/audit/audited.decorator';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { Public } from '../../../common/auth/public.decorator';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { ForgotPasswordUseCase } from '../application/forgot-password.usecase';
import { GetUserProfileUseCase } from '../application/get-user-profile.usecase';
import { LoginUseCase } from '../application/login.usecase';
import { LogoutUseCase } from '../application/logout.usecase';
import { RefreshAccessTokenUseCase } from '../application/refresh-access-token.usecase';
import { ResetPasswordUseCase } from '../application/reset-password.usecase';
import { SignupUseCase } from '../application/signup.usecase';
import { SwitchOrganizationUseCase } from '../application/switch-organization.usecase';
import { VerifyEmailUseCase } from '../application/verify-email.usecase';
import { REFRESH_TOKEN_TTL_MS } from '../refresh-token-ttl';
import { AuthCompositeRateLimitGuard } from './auth-composite-rate-limit.guard';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SignupDto } from './dto/signup.dto';
import { SwitchOrganizationDto } from './dto/switch-organization.dto';
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
  async signup(
    @Body() dto: SignupDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.signupUseCase.execute(dto);
    response.cookie(
      REFRESH_COOKIE_NAME,
      result.refreshToken,
      this.refreshCookieOptions,
    );
    return {
      userId: result.user.id,
      organizationId: result.organization.id,
      accessToken: result.accessToken,
    };
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('verify-email')
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    await this.verifyEmailUseCase.execute(dto.token);
    return { verified: true };
  }

  @Public()
  @UseGuards(AuthCompositeRateLimitGuard)
  @Audited(AuditActionType.AUTH_LOGIN, AuditEntityType.AUTH)
  @Post('login')
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
  @UseGuards(AuthCompositeRateLimitGuard)
  @Post('refresh')
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
  async logout(
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.logoutUseCase.execute(request.cookies?.[REFRESH_COOKIE_NAME]);
    response.clearCookie(REFRESH_COOKIE_NAME, this.refreshCookieOptions);
    return { success: true };
  }

  @Post('switch-organization')
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
  @UseGuards(JwtAuthGuard)
  async getMe(@Req() request: AuthRequest): Promise<UserProfileResponseDto> {
    const userId = request.user?.userId;
    if (!userId) {
      throw new UnauthorizedException();
    }
    const result = await this.getUserProfileUseCase.execute(userId);
    return toUserProfileResponse(result);
  }

  @Public()
  @UseGuards(AuthCompositeRateLimitGuard)
  @Audited(AuditActionType.AUTH_FORGOT_PASSWORD, AuditEntityType.AUTH)
  @HttpCode(HttpStatus.OK)
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.forgotPasswordUseCase.execute(dto.email);
    return { success: true };
  }

  @Public()
  @UseGuards(AuthCompositeRateLimitGuard)
  @Audited(AuditActionType.AUTH_RESET_PASSWORD, AuditEntityType.AUTH)
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.resetPasswordUseCase.execute(dto);
    return { success: true };
  }
}
