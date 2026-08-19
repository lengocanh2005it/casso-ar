import {
  Controller,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { UploadAvatarUseCase } from '../application/upload-avatar.usecase';

@ApiTags('Profile')
@Controller('profile')
export class ProfileController {
  constructor(private readonly uploadAvatarUseCase: UploadAvatarUseCase) {}

  @Post('avatar')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload avatar image' })
  async uploadAvatar(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: { user?: { userId: string } },
  ) {
    return this.uploadAvatarUseCase.execute(req.user?.userId ?? '', file);
  }
}
