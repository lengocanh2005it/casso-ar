import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { Public } from '../../../common/auth/public.decorator';
// biome-ignore lint/style/useImportType: NestJS DI resolves constructor parameters at runtime.
import { ForgotPasswordUseCase } from '../application/forgot-password.usecase';
// biome-ignore lint/style/useImportType: NestJS DI resolves constructor parameters at runtime.
import { LoginUseCase } from '../application/login.usecase';
// biome-ignore lint/style/useImportType: NestJS DI resolves constructor parameters at runtime.
import { LogoutUseCase } from '../application/logout.usecase';
// biome-ignore lint/style/useImportType: NestJS DI resolves constructor parameters at runtime.
import { RefreshAccessTokenUseCase } from '../application/refresh-access-token.usecase';
// biome-ignore lint/style/useImportType: NestJS DI resolves constructor parameters at runtime.
import { ResetPasswordUseCase } from '../application/reset-password.usecase';
// biome-ignore lint/style/useImportType: NestJS DI resolves constructor parameters at runtime.
import { SignupUseCase } from '../application/signup.usecase';
// biome-ignore lint/style/useImportType: NestJS DI resolves constructor parameters at runtime.
import { SwitchOrganizationUseCase } from '../application/switch-organization.usecase';
// biome-ignore lint/style/useImportType: NestJS DI resolves constructor parameters at runtime.
import { VerifyEmailUseCase } from '../application/verify-email.usecase';
import { AuthCompositeRateLimitGuard } from './auth-composite-rate-limit.guard';
// biome-ignore lint/style/useImportType: ValidationPipe needs the DTO runtime metadata.
import { ForgotPasswordDto } from './dto/forgot-password.dto';
// biome-ignore lint/style/useImportType: ValidationPipe needs the DTO runtime metadata.
import { LoginDto } from './dto/login.dto';
// biome-ignore lint/style/useImportType: ValidationPipe needs the DTO runtime metadata.
import { ResetPasswordDto } from './dto/reset-password.dto';
// biome-ignore lint/style/useImportType: ValidationPipe needs the DTO runtime metadata.
import { SignupDto } from './dto/signup.dto';

const REFRESH_COOKIE_NAME = 'refreshToken';
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

interface AuthRequest extends Request {
  user?: { userId: string };
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
  ) {}

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
      REFRESH_COOKIE_OPTIONS,
    );
    return {
      userId: result.user.id,
      organizationId: result.organization.id,
      accessToken: result.accessToken,
    };
  }

  @Public()
  @Get('verify-email')
  async verifyEmail(@Query('token') token: string) {
    await this.verifyEmailUseCase.execute(token);
    return { verified: true };
  }

  @Public()
  @UseGuards(AuthCompositeRateLimitGuard)
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.loginUseCase.execute(dto);
    response.cookie(
      REFRESH_COOKIE_NAME,
      result.refreshToken,
      REFRESH_COOKIE_OPTIONS,
    );
    return { accessToken: result.accessToken };
  }

  @Public()
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
      REFRESH_COOKIE_OPTIONS,
    );
    return { accessToken: result.accessToken };
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  async logout(
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.logoutUseCase.execute(request.cookies?.[REFRESH_COOKIE_NAME]);
    response.clearCookie(REFRESH_COOKIE_NAME, REFRESH_COOKIE_OPTIONS);
    return { success: true };
  }

  @Post('switch-organization')
  @UseGuards(JwtAuthGuard)
  async switchOrganization(
    @Req() request: AuthRequest,
    @Body('organizationId') organizationId: string,
  ) {
    return this.switchOrganizationUseCase.execute(
      request.user?.userId ?? '',
      organizationId,
    );
  }

  @Public()
  @UseGuards(AuthCompositeRateLimitGuard)
  @HttpCode(HttpStatus.OK)
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.forgotPasswordUseCase.execute(dto.email);
    return { success: true };
  }

  @Public()
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.resetPasswordUseCase.execute(dto);
    return { success: true };
  }
}
