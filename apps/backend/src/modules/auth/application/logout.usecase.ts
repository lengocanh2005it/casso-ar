import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  type IRefreshTokenRepository,
  REFRESH_TOKEN_REPOSITORY,
} from './refresh-token-repository.port';
import { hashToken } from './token-hasher';

@Injectable()
export class LogoutUseCase {
  constructor(
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokenRepo: IRefreshTokenRepository,
    private readonly dataSource: DataSource,
  ) {}

  async execute(rawRefreshToken: string): Promise<void> {
    if (!rawRefreshToken?.trim()) return;
    const existing = await this.refreshTokenRepo.findByTokenHash(
      hashToken(rawRefreshToken),
    );
    if (!existing) return;
    await this.dataSource.transaction(async (manager) => {
      // Logout ends the whole device session: rotation and grace replays can
      // leave several live tokens in it, and none may outlive the logout.
      if (existing.sessionId) {
        await this.refreshTokenRepo.revokeSession(existing.sessionId, manager);
        return;
      }
      await this.refreshTokenRepo.save(existing.revoke(), manager);
    });
  }
}
