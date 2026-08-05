import { Inject, Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: NestJS DI resolves this constructor parameter at runtime.
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
      await this.refreshTokenRepo.save(existing.revoke(), manager);
    });
  }
}
