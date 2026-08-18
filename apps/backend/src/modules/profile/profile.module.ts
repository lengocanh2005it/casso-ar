import { Module } from '@nestjs/common';
import { UploadAvatarUseCase } from './application/upload-avatar.usecase';
import { ProfileController } from './presentation/profile.controller';

@Module({
  controllers: [ProfileController],
  providers: [UploadAvatarUseCase],
})
export class ProfileModule {}
