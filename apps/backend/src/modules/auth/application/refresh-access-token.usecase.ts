import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { JsonLogger } from '../../../common/observability/json-logger.service';
import {
  type IMembershipRepository,
  MEMBERSHIP_REPOSITORY,
} from '../../organizations/application/membership-repository.port';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../users/application/user-repository.port';
import { RefreshToken } from '../domain/refresh-token';
import {
  REFRESH_TOKEN_GRACE_WINDOW_MS,
  REFRESH_TOKEN_TTL_MS,
} from '../refresh-token-ttl';
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

const INVALID_REFRESH_TOKEN_MESSAGE =
  'Refresh token không hợp lệ hoặc đã hết hạn.';

@Injectable()
export class RefreshAccessTokenUseCase {
  constructor(
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokenRepo: IRefreshTokenRepository,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: IMembershipRepository,
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    @Inject(TOKEN_SIGNER) private readonly tokenSigner: ITokenSigner,
    private readonly dataSource: DataSource,
    @Optional() private readonly logger?: JsonLogger,
  ) {}

  async execute(rawRefreshToken: string): Promise<RefreshResult> {
    if (!rawRefreshToken?.trim()) {
      throw new AppError(ErrorCode.UNAUTHORIZED, INVALID_REFRESH_TOKEN_MESSAGE);
    }
    const rawHash = hashToken(rawRefreshToken);

    // Theft detection outside the rotation transaction: a revoked token can
    // only be revoked after rotation, so anyone presenting it again holds a
    // leaked copy — unless it is a benign race inside the rotation grace
    // window. Revoke the whole family in its OWN committed transaction — if
    // this ran inside the rotation transaction it would be rolled back with
    // the UNAUTHORIZED throw and never persist.
    const probe = await this.refreshTokenRepo.findByTokenHash(rawHash);
    if (probe?.revokedAt && !(await this.isWithinGraceWindow(probe))) {
      await this.refreshTokenRepo.revokeAllForUser(probe.userId);
      throw new AppError(ErrorCode.UNAUTHORIZED, INVALID_REFRESH_TOKEN_MESSAGE);
    }

    return this.dataSource.transaction(async (manager) => {
      const existing = await this.refreshTokenRepo.findByTokenHash(
        rawHash,
        manager,
        true,
      );
      if (
        existing?.revokedAt &&
        (await this.isWithinGraceWindow(existing, manager))
      ) {
        this.logger?.warn({
          message: 'Refresh token reused within rotation grace window',
          // Not `userId`: JsonLogger overwrites that key with the
          // authenticated user, which is absent on this pre-auth endpoint.
          refreshTokenUserId: existing.userId,
          refreshTokenId: existing.id,
        });
        return this.issueSession(existing.userId, manager, null);
      }
      if (!existing?.isValid(new Date())) {
        throw new AppError(
          ErrorCode.UNAUTHORIZED,
          INVALID_REFRESH_TOKEN_MESSAGE,
        );
      }
      return this.issueSession(existing.userId, manager, existing);
    });
  }

  // Measured from the successor's createdAt (timestamptz) rather than the
  // presented token's revokedAt, which is a timezone-less timestamp.
  private async isWithinGraceWindow(
    token: RefreshToken,
    manager?: EntityManager,
  ): Promise<boolean> {
    if (token.replacedByTokenId === null) return false;
    const successor = await this.refreshTokenRepo.findById(
      token.replacedByTokenId,
      manager,
    );
    return (
      successor !== null &&
      successor.revokedAt === null &&
      Date.now() - successor.createdAt.getTime() <=
        REFRESH_TOKEN_GRACE_WINDOW_MS
    );
  }

  // Signs a new access token and issues a new refresh token. When `rotated`
  // is given it is revoked and linked to its successor; the grace path passes
  // null and leaves the presented token untouched.
  private async issueSession(
    userId: string,
    manager: EntityManager,
    rotated: RefreshToken | null,
  ): Promise<RefreshResult> {
    const [membership, user] = await Promise.all([
      this.membershipRepo.findFirstActiveByUserId(userId),
      this.userRepo.findById(userId),
    ]);
    if (!membership && !user?.isOperator) {
      throw new AppError(
        ErrorCode.FORBIDDEN,
        'Tài khoản chưa thuộc tổ chức nào.',
      );
    }
    const accessToken = this.tokenSigner.sign(
      membership
        ? {
            userId,
            organizationId: membership.organizationId,
            role: membership.role,
            isOperator: user?.isOperator ?? false,
          }
        : { userId, isOperator: true },
    );
    const { token: newRawToken, hash } = generateToken();
    const newTokenId = randomUUID();
    if (rotated) {
      await this.refreshTokenRepo.save(rotated.revoke(newTokenId), manager);
    }
    await this.refreshTokenRepo.save(
      new RefreshToken({
        id: newTokenId,
        userId,
        tokenHash: hash,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        revokedAt: null,
        replacedByTokenId: null,
        createdAt: new Date(),
      }),
      manager,
    );
    return { accessToken, refreshToken: newRawToken };
  }
}
