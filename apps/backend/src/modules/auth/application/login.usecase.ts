import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
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
import { type ITokenSigner, TOKEN_SIGNER } from './token-signer.port';

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
    @Inject(TOKEN_SIGNER) private readonly tokenSigner: ITokenSigner,
  ) {}

  async execute(input: LoginInput): Promise<LoginResult> {
    const email = input.email.trim().toLowerCase();
    const user = await this.userRepo.findByEmail(email);
    if (!user || !(await comparePassword(input.password, user.passwordHash))) {
      throw new AppError(
        ErrorCode.UNAUTHORIZED,
        'Email hoặc mật khẩu không đúng.',
      );
    }

    const membership = await this.membershipRepo.findFirstActiveByUserId(
      user.id,
    );
    if (!membership && !user.isOperator) {
      throw new AppError(
        ErrorCode.FORBIDDEN,
        'Tài khoản chưa thuộc tổ chức nào.',
      );
    }

    const accessToken = this.tokenSigner.sign(
      membership
        ? {
            userId: user.id,
            organizationId: membership.organizationId,
            role: membership.role,
            isOperator: user.isOperator,
          }
        : { userId: user.id, isOperator: true },
    );
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
