import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';

interface UpdateProfileInput {
  userId: string;
  name?: string;
  organizationName?: string;
  role: string;
}

@Injectable()
export class UpdateProfileUseCase {
  private readonly logger = new Logger(UpdateProfileUseCase.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(input: UpdateProfileInput): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      if (input.name !== undefined) {
        if (input.name.length < 2 || input.name.length > 100) {
          throw new AppError(
            ErrorCode.VALIDATION_ERROR,
            'Tên phải từ 2-100 ký tự',
          );
        }
        await manager.query('UPDATE users SET name = $1 WHERE id = $2', [
          input.name,
          input.userId,
        ]);
      }

      if (input.organizationName !== undefined) {
        if (input.role !== 'OWNER') {
          throw new AppError(
            ErrorCode.FORBIDDEN,
            'Chỉ chủ sở hữu mới có thể sửa tên doanh nghiệp',
          );
        }
        if (
          input.organizationName.length < 2 ||
          input.organizationName.length > 200
        ) {
          throw new AppError(
            ErrorCode.VALIDATION_ERROR,
            'Tên doanh nghiệp phải từ 2-200 ký tự',
          );
        }
        const orgId = this.tenantContext.getOrganizationId();
        await manager.query(
          'UPDATE organizations SET name = $1 WHERE id = $2',
          [input.organizationName, orgId],
        );
      }
    });

    this.logger.log({ message: 'Profile updated', userId: input.userId });
  }
}
