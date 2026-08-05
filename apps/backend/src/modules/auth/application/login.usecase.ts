import { randomUUID } from 'node:crypto';
import { HttpException, Inject, Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: NestJS DI resolves this constructor parameter at runtime.
import { JwtService } from '@nestjs/jwt';
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
import { REFRESH_TOKEN_TTL_MS } from '../refresh-token-ttl';
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
      throw new HttpException(
        {
          statusCode: 401,
          errorCode: ErrorCode.UNAUTHORIZED,
          message: 'Email hoặc mật khẩu không đúng.',
        },
        401,
      );
    }

    const membership = await this.membershipRepo.findFirstActiveByUserId(
      user.id,
    );
    if (!membership) {
      throw new HttpException(
        {
          statusCode: 403,
          errorCode: ErrorCode.FORBIDDEN,
          message: 'Tài khoản chưa thuộc tổ chức nào.',
        },
        403,
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
