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

type RefreshOutcome =
  | { kind: 'session'; result: RefreshResult }
  | { kind: 'theft'; userId: string };

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
    if (probe?.revokedAt && !(await this.findRaceSuccessor(probe))) {
      await this.revokeFamilyAndReject(probe.userId);
    }

    const outcome = await this.dataSource.transaction(
      async (manager): Promise<RefreshOutcome> => {
        const existing = await this.refreshTokenRepo.findByTokenHash(
          rawHash,
          manager,
          true,
        );
        if (existing?.revokedAt) {
          // The window can close between the pre-check and the row lock.
          const raceSuccessor = await this.findRaceSuccessor(existing, manager);
          if (!raceSuccessor) {
            return { kind: 'theft', userId: existing.userId };
          }
          this.logger?.warn({
            message: 'Refresh token reused within rotation grace window',
            userId: existing.userId,
            refreshTokenId: existing.id,
          });
          return {
            kind: 'session',
            result: await this.replaySession(existing, raceSuccessor, manager),
          };
        }
        if (!existing?.isValid(new Date())) {
          throw new AppError(
            ErrorCode.UNAUTHORIZED,
            INVALID_REFRESH_TOKEN_MESSAGE,
          );
        }
        return {
          kind: 'session',
          result: await this.rotateSession(existing, manager),
        };
      },
    );
    if (outcome.kind === 'theft') {
      return this.revokeFamilyAndReject(outcome.userId);
    }
    return outcome.result;
  }

  private async revokeFamilyAndReject(userId: string): Promise<never> {
    await this.refreshTokenRepo.revokeAllForUser(userId);
    throw new AppError(ErrorCode.UNAUTHORIZED, INVALID_REFRESH_TOKEN_MESSAGE);
  }

  // Inside the transaction the successor row is read under a share lock so a
  // concurrent logout cannot revoke it between this check and our commit.
  // Returns the successor when `token` is a benign race replay, else null.
  private async findRaceSuccessor(
    token: RefreshToken,
    manager?: EntityManager,
  ): Promise<RefreshToken | null> {
    if (token.replacedByTokenId === null) return null;
    const successor = await this.refreshTokenRepo.findById(
      token.replacedByTokenId,
      manager,
      manager !== undefined,
    );
    return token.canReplayAsRace(successor, new Date()) ? successor : null;
  }

  // Normal rotation: the presented token is replaced by a new one.
  private async rotateSession(
    presented: RefreshToken,
    manager: EntityManager,
  ): Promise<RefreshResult> {
    const accessToken = await this.signAccessToken(presented.userId);
    // A token issued before sessions existed starts one here, so from now on
    // logout can end everything that descends from it.
    const { successor, rawToken } = this.newSuccessor(
      presented,
      presented.sessionId ?? randomUUID(),
    );
    await this.refreshTokenRepo.save(presented.rotate(successor.id), manager);
    await this.refreshTokenRepo.save(successor, manager);
    return { accessToken, refreshToken: rawToken };
  }

  // Grace replay: the presented token and its existing successor stay as they
  // are; the presenter simply gets one more token in the successor's session
  // (the presented token may predate sessions and carry none).
  private async replaySession(
    presented: RefreshToken,
    raceSuccessor: RefreshToken,
    manager: EntityManager,
  ): Promise<RefreshResult> {
    const accessToken = await this.signAccessToken(presented.userId);
    const { successor, rawToken } = this.newSuccessor(
      presented,
      raceSuccessor.sessionId,
    );
    await this.refreshTokenRepo.save(successor, manager);
    return { accessToken, refreshToken: rawToken };
  }

  private newSuccessor(
    presented: RefreshToken,
    sessionId: string | null,
  ): {
    successor: RefreshToken;
    rawToken: string;
  } {
    const { token: rawToken, hash } = generateToken();
    const successor = new RefreshToken({
      id: randomUUID(),
      userId: presented.userId,
      sessionId,
      tokenHash: hash,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      revokedAt: null,
      replacedByTokenId: null,
      createdAt: new Date(),
    });
    return { successor, rawToken };
  }

  private async signAccessToken(userId: string): Promise<string> {
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
    return this.tokenSigner.sign(
      membership
        ? {
            userId,
            organizationId: membership.organizationId,
            role: membership.role,
            isOperator: user?.isOperator ?? false,
          }
        : { userId, isOperator: true },
    );
  }
}
