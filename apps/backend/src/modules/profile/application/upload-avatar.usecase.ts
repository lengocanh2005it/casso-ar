import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';

const UPLOAD_DIR = path.resolve('uploads/avatars');
const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

@Injectable()
export class UploadAvatarUseCase {
  private readonly logger = new Logger(UploadAvatarUseCase.name);

  constructor(private readonly dataSource: DataSource) {}

  async execute(
    userId: string,
    file: Express.Multer.File,
  ): Promise<{ avatarUrl: string }> {
    if (!file) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'Không có file được tải lên',
      );
    }
    if (file.size > MAX_SIZE) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'File quá lớn (tối đa 5MB)',
      );
    }
    if (!ALLOWED_TYPES.includes(file.mimetype)) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'Định dạng file không hợp lệ (chỉ chấp nhận JPEG, PNG, WebP, GIF)',
      );
    }

    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }

    const result = await this.dataSource.query(
      'SELECT avatar_url FROM users WHERE id = $1',
      [userId],
    );
    const oldAvatarUrl = result[0]?.avatar_url as string | null;

    const ext = path.extname(file.originalname) || '.jpg';
    const filename = `${randomUUID()}${ext}`;
    const filePath = path.join(UPLOAD_DIR, filename);
    fs.writeFileSync(filePath, file.buffer);

    const avatarUrl = `/uploads/avatars/${filename}`;
    await this.dataSource.query(
      'UPDATE users SET avatar_url = $1 WHERE id = $2',
      [avatarUrl, userId],
    );

    if (oldAvatarUrl) {
      const oldPath = path.join(process.cwd(), oldAvatarUrl);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    this.logger.log({ message: 'Avatar uploaded', userId, avatarUrl });
    return { avatarUrl };
  }
}
