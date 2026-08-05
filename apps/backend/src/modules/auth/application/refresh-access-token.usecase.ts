import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
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
import { type ITokenSigner, TOKEN_SIGNER } from './token-signer.port';

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
    @Inject(TOKEN_SIGNER) private readonly tokenSigner: ITokenSigner,
    private readonly dataSource: DataSource,
  ) {}

  async execute(rawRefreshToken: string): Promise<RefreshResult> {
    if (!rawRefreshToken?.trim()) {
      throw new AppError(
        ErrorCode.UNAUTHORIZED,
        'Refresh token không hợp lệ hoặc đã hết hạn.',
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
        throw new AppError(
          ErrorCode.UNAUTHORIZED,
          'Refresh token không hợp lệ hoặc đã hết hạn.',
        );
      }
      const membership = await this.membershipRepo.findFirstActiveByUserId(
        existing.userId,
      );
      if (!membership) {
        throw new AppError(
          ErrorCode.FORBIDDEN,
          'Tài khoản chưa thuộc tổ chức nào.',
        );
      }
      const accessToken = this.tokenSigner.sign({
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
