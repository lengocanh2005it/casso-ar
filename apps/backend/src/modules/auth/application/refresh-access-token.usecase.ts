import { randomUUID } from 'node:crypto';
import { HttpException, Inject, Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: NestJS DI resolves this constructor parameter at runtime.
import { JwtService } from '@nestjs/jwt';
// biome-ignore lint/style/useImportType: NestJS DI resolves this constructor parameter at runtime.
import { DataSource } from 'typeorm';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  type IMembershipRepository,
  MEMBERSHIP_REPOSITORY,
} from '../../organizations/application/membership-repository.port';
import { RefreshToken } from '../domain/refresh-token';
import { REFRESH_TOKEN_TTL_MS } from '../refresh-token-ttl';
import {
  type IRefreshTokenRepository,
  REFRESH_TOKEN_REPOSITORY,
} from './refresh-token-repository.port';
import { generateToken, hashToken } from './token-hasher';

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class RefreshAccessTokenUseCase {
  constructor(
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokenRepo: IRefreshTokenRepository,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: IMembershipRepository,
    private readonly jwtService: JwtService,
    private readonly dataSource: DataSource,
  ) {}

  async execute(rawRefreshToken: string): Promise<RefreshResult> {
    if (!rawRefreshToken?.trim()) {
      throw new HttpException(
        {
          statusCode: 401,
          errorCode: ErrorCode.UNAUTHORIZED,
          message: 'Refresh token không hợp lệ hoặc đã hết hạn.',
        },
        401,
      );
    }
    const { token: newRawToken, hash } = generateToken();
    return this.dataSource.transaction(async (manager) => {
      const existing = await this.refreshTokenRepo.findByTokenHash(
        hashToken(rawRefreshToken),
        manager,
        true,
      );
      if (!existing?.isValid(new Date())) {
        throw new HttpException(
          {
            statusCode: 401,
            errorCode: ErrorCode.UNAUTHORIZED,
            message: 'Refresh token không hợp lệ hoặc đã hết hạn.',
          },
          401,
        );
      }
      const membership = await this.membershipRepo.findFirstActiveByUserId(
        existing.userId,
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
        userId: existing.userId,
        organizationId: membership.organizationId,
        role: membership.role,
      });
      await this.refreshTokenRepo.save(existing.revoke(), manager);
      await this.refreshTokenRepo.save(
        new RefreshToken({
          id: randomUUID(),
          userId: existing.userId,
          tokenHash: hash,
          expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
          revokedAt: null,
          createdAt: new Date(),
        }),
        manager,
      );
      return { accessToken, refreshToken: newRawToken };
    });
  }
}
