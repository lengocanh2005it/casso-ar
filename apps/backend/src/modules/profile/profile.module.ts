import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CHANGE_PASSWORD_OTP_REPOSITORY } from './application/change-password-otp-repository.port';
import { UploadAvatarUseCase } from './application/upload-avatar.usecase';
import { ChangePasswordOtpOrmEntity } from './infrastructure/change-password-otp.orm-entity';
import { TypeOrmChangePasswordOtpRepository } from './infrastructure/typeorm-change-password-otp.repository';
import { ProfileController } from './presentation/profile.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ChangePasswordOtpOrmEntity])],
  controllers: [ProfileController],
  providers: [
    UploadAvatarUseCase,
    {
      provide: CHANGE_PASSWORD_OTP_REPOSITORY,
      useClass: TypeOrmChangePasswordOtpRepository,
    },
  ],
  exports: [CHANGE_PASSWORD_OTP_REPOSITORY],
})
export class ProfileModule {}
