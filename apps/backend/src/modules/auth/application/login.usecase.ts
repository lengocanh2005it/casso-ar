import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: NestJS DI resolves this constructor parameter at runtime.
import { JwtService } from '@nestjs/jwt';
import { AuthError } from '../../../common/errors/auth.error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  type IMembershipRepository,
  MEMBERSHIP_REPOSITORY,
} from '../../organizations/application/membership-repository.port';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../users/application/user-repository.port';
import { RefreshToken } from '../domain/refresh-token';
import { comparePassword } from './password-hasher';
import {
  type IRefreshTokenRepository,
  REFRESH_TOKEN_REPOSITORY,
} from './refresh-token-repository.port';
import { generateToken } from './token-hasher';

export interface LoginInput {
  email: string;
  password: string;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
}

const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class LoginUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: IMembershipRepository,
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokenRepo: IRefreshTokenRepository,
    private readonly jwtService: JwtService,
  ) {}

  async execute(input: LoginInput): Promise<LoginResult> {
    const email = input.email.trim().toLowerCase();
    const user = await this.userRepo.findByEmail(email);
    if (!user || !(await comparePassword(input.password, user.passwordHash))) {
      throw new AuthError(
        401,
        ErrorCode.UNAUTHORIZED,
        'Email hoặc mật khẩu không đúng.',
      );
    }

    const membership = await this.membershipRepo.findFirstActiveByUserId(
      user.id,
    );
    if (!membership) {
      throw new AuthError(
        403,
        ErrorCode.FORBIDDEN,
        'Tài khoản chưa thuộc tổ chức nào.',
      );
    }

    const accessToken = this.jwtService.sign({
      userId: user.id,
      organizationId: membership.organizationId,
      role: membership.role,
    });
    const { token: refreshToken, hash } = generateToken();

    await this.refreshTokenRepo.save(
      new RefreshToken({
        id: randomUUID(),
        userId: user.id,
        tokenHash: hash,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        revokedAt: null,
        createdAt: new Date(),
      }),
    );

    return { accessToken, refreshToken };
  }
}
