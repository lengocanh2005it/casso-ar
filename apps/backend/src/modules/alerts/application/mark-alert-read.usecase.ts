import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import {
  ALERT_REPOSITORY,
  type IAlertRepository,
} from './alert-repository.port';

@Injectable()
export class MarkAlertReadUseCase {
  constructor(
    @Inject(ALERT_REPOSITORY) private readonly alertRepo: IAlertRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(id: string): Promise<void> {
    const user = this.tenantContext.getCurrentUser();
    if (!user) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Yêu cầu đăng nhập.');
    }
    const alert = await this.alertRepo.findByIdForUser(id, user.userId);
    if (!alert) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy thông báo.');
    }
    await this.alertRepo.markRead(id, user.userId);
  }
}
