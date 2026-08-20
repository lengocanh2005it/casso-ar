import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  type IMembershipRepository,
  MEMBERSHIP_REPOSITORY,
} from '../../organizations/application/membership-repository.port';
import {
  type IOrganizationRepository,
  ORGANIZATION_REPOSITORY,
} from '../../organizations/application/organization-repository.port';
import type { Membership } from '../../organizations/domain/membership';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../users/application/user-repository.port';
import type { User } from '../../users/domain/user';
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
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepo: IOrganizationRepository,
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
    if (!user.isEmailVerified()) {
      throw new AppError(
        ErrorCode.EMAIL_NOT_VERIFIED,
        'Email chưa được xác thực.',
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

    await this.assertOrganizationActive(membership);
    return this.issueSession(user, membership);
  }

  async executeForUser(userId: string): Promise<LoginResult> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy người dùng.');
    }
    if (!user.isEmailVerified()) {
      throw new AppError(ErrorCode.FORBIDDEN, 'Email chưa được xác minh.');
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

    await this.assertOrganizationActive(membership);
    return this.issueSession(user, membership);
  }

  private async assertOrganizationActive(
    membership: Membership | null,
  ): Promise<void> {
    if (!membership) return;
    const organization = await this.organizationRepo.findById(
      membership.organizationId,
    );
    if (organization?.status === 'PENDING_REVIEW') {
      throw new AppError(
        ErrorCode.ORGANIZATION_PENDING_REVIEW,
        'Tổ chức của bạn đang chờ được duyệt.',
      );
    }
    if (organization?.status === 'REJECTED') {
      throw new AppError(
        ErrorCode.ORGANIZATION_REJECTED,
        'Đăng ký tổ chức của bạn chưa được chấp thuận.',
      );
    }
  }

  private async issueSession(
    user: User,
    membership: Membership | null,
  ): Promise<LoginResult> {
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
