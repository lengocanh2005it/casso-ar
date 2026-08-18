import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { IChangePasswordOtpRepository } from '../application/change-password-otp-repository.port';
import type { ChangePasswordOtp } from '../domain/change-password-otp';
import { ChangePasswordOtpOrmEntity } from './change-password-otp.orm-entity';

@Injectable()
export class TypeOrmChangePasswordOtpRepository
  implements IChangePasswordOtpRepository
{
  constructor(private readonly dataSource: DataSource) {}

  async create(data: {
    userId: string;
    otpHash: string;
    expiresAt: Date;
  }): Promise<ChangePasswordOtp> {
    const repo = this.dataSource.getRepository(ChangePasswordOtpOrmEntity);
    const entity = repo.create(data);
    const saved = await repo.save(entity);
    return saved;
  }

  async findValidOtp(
    userId: string,
    otpHash: string,
  ): Promise<ChangePasswordOtp | null> {
    const repo = this.dataSource.getRepository(ChangePasswordOtpOrmEntity);
    return repo.findOne({
      where: { userId, otpHash, used: false },
      order: { createdAt: 'DESC' },
    });
  }

  async markUsed(id: string): Promise<void> {
    const repo = this.dataSource.getRepository(ChangePasswordOtpOrmEntity);
    await repo.update(id, { used: true });
  }

  async invalidatePrevious(userId: string): Promise<void> {
    const repo = this.dataSource.getRepository(ChangePasswordOtpOrmEntity);
    await repo.update({ userId, used: false }, { used: true });
  }
}
